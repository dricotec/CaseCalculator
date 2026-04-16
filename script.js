const PROFILE_INPUT = document.getElementById('profileUrl');
const CALCULATE_BUTTON = document.getElementById('calculateBtn');
const STATUS = document.getElementById('status');
const SUMMARY = document.getElementById('summary');
const TOTAL_CASES = document.getElementById('totalCases');
const TOTAL_VALUE = document.getElementById('totalValue');
const RESULTS = document.getElementById('results');
const CARD_TEMPLATE = document.getElementById('caseCardTemplate');
const CURRENCY_SELECTOR = document.getElementById('currencySelector');

const CRATES_API_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/refs/heads/main/public/api/en/crates.json';

let cratesByName = null;

const CURRENCIES = {
  1: { code: 'USD', symbol: '$', format: 'en-US' },
  2: { code: 'GBP', symbol: '£', format: 'en-GB' },
  3: { code: 'EUR', symbol: '€', format: 'de-DE' },
  4: { code: 'RUB', symbol: 'pуб.', format: 'ru-RU' },
  5: { code: 'BRL', symbol: 'R$', format: 'pt-BR' },
  7: { code: 'JPY', symbol: '¥', format: 'ja-JP' },
  8: { code: 'NOK', symbol: 'kr', format: 'nb-NO' },
  9: { code: 'IDR', symbol: 'Rp', format: 'id-ID' },
  10: { code: 'MYR', symbol: 'RM', format: 'ms-MY' },
  11: { code: 'PHP', symbol: '₱', format: 'en-PH' },
  12: { code: 'SGD', symbol: 'S$', format: 'en-SG' },
  13: { code: 'THB', symbol: '฿', format: 'th-TH' },
  14: { code: 'VND', symbol: '₫', format: 'vi-VN' },
  15: { code: 'KRW', symbol: '₩', format: 'ko-KR' },
  16: { code: 'TRY', symbol: '₺', format: 'tr-TR' },
  17: { code: 'UAH', symbol: '₴', format: 'uk-UA' },
  18: { code: 'MXN', symbol: 'Mex$', format: 'es-MX' },
  19: { code: 'CAD', symbol: 'CDN$', format: 'en-CA' },
  20: { code: 'AUD', symbol: 'A$', format: 'en-AU' },
  21: { code: 'NZD', symbol: 'NZ$', format: 'en-NZ' },
  22: { code: 'CNY', symbol: '¥', format: 'zh-CN' },
  23: { code: 'INR', symbol: '₹', format: 'en-IN' },
  24: { code: 'CLP', symbol: 'CLP$', format: 'es-CL' },
  25: { code: 'PEN', symbol: 'S/.', format: 'es-PE' },
  26: { code: 'COP', symbol: 'COL$', format: 'es-CO' },
  27: { code: 'ZAR', symbol: 'R', format: 'en-ZA' },
  28: { code: 'HKD', symbol: 'HK$', format: 'zh-HK' },
  29: { code: 'TWD', symbol: 'NT$', format: 'zh-TW' },
  30: { code: 'SAR', symbol: 'SR', format: 'ar-SA' },
  31: { code: 'AED', symbol: 'AED', format: 'ar-AE' },
  32: { code: 'PLN', symbol: 'zł', format: 'pl-PL' }
};

let currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

function populateCurrencies() {
  for (const id in CURRENCIES) {
    const currency = CURRENCIES[id];
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${currency.code} (${currency.symbol})`;
    CURRENCY_SELECTOR.appendChild(option);
  }
  CURRENCY_SELECTOR.value = '1'; // Default to USD
}

function updateCurrencyFormatter() {
  const currencyId = CURRENCY_SELECTOR.value;
  const currency = CURRENCIES[currencyId];
  currencyFormatter = new Intl.NumberFormat(currency.format, {
    style: 'currency',
    currency: currency.code
  });
}

function proxied(url) {
  return `https://cors-anywhere.herokuapp.com/${encodeURIComponent(url)}`;
}

function setStatus(message, isError = false) {
  STATUS.textContent = message;
  STATUS.style.color = isError ? '#ff8a8a' : 'var(--muted)';
  if (message) {
    STATUS.classList.remove('hidden');
  } else {
    STATUS.classList.add('hidden');
  }
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error('Network request failed. Steam or proxy endpoints may be temporarily unavailable.');
  }
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

function parseSteamProfileInput(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error('Please enter a Steam profile URL.');
  }

  const inputUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  const parsed = new URL(inputUrl);

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'steamcommunity.com' && hostname !== 'www.steamcommunity.com') {
    throw new Error('Please enter a valid Steam community profile URL.');
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('The URL is missing the profile identifier.');
  }

  const [type, identifier] = parts;
  if (!identifier) {
    throw new Error('The URL is missing the profile identifier.');
  }

  return { type, identifier };
}

async function resolveSteamId64({ type, identifier }) {
  if (type === 'profiles' && /^\d{17}$/.test(identifier)) {
    return identifier;
  }

  if (type === 'id') {
    const xmlProfileUrl = `https://steamcommunity.com/id/${encodeURIComponent(identifier)}/?xml=1`;
    const xmlText = await fetch(proxied(xmlProfileUrl))
      .then((response) => {
        if (!response.ok) {
          throw new Error('Could not resolve profile URL.');
        }
        return response.text();
      })
      .catch(() => {
        throw new Error('Could not resolve profile URL due to a network/proxy error.');
      });

    const steamIdMatch = xmlText.match(/<steamID64>(\d+)<\/steamID64>/);
    if (!steamIdMatch) {
      throw new Error('Could not find steamID64 for this profile.');
    }
    return steamIdMatch[1];
  }

  throw new Error('Use a profile URL like /id/name or /profiles/steamid64.');
}

async function loadCratesMap() {
  if (cratesByName) {
    return cratesByName;
  }

  const crates = await fetchJson(CRATES_API_URL);
  cratesByName = new Map();

  for (const crate of crates) {
    if (!crate?.market_hash_name && !crate?.name) {
      continue;
    }

    const hashName = crate.market_hash_name?.toLowerCase();
    const displayName = crate.name?.toLowerCase();

    if (hashName) {
      cratesByName.set(hashName, crate);
    }
    if (displayName) {
      cratesByName.set(displayName, crate);
    }
  }

  return cratesByName;
}

function parsePriceToNumber(priceString) {
  if (!priceString) {
    return 0;
  }

  const cleaned = priceString.replace(/[^\d.,]/g, '');
  if (!cleaned) {
    return 0;
  }

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    const lastCommaIndex = cleaned.lastIndexOf(',');
    const lastDotIndex = cleaned.lastIndexOf('.');
    if (lastCommaIndex > lastDotIndex) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\.(?=.*\.)/g, '');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchCasePrice(marketHashName) {
  const currencyId = CURRENCY_SELECTOR.value;
  const marketUrl = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${currencyId}&market_hash_name=${encodeURIComponent(
    marketHashName
  )}`;

  const payload = await fetchJson(proxied(marketUrl));
  const rawPrice = payload.lowest_price || payload.median_price || '0';
  return {
    label: rawPrice,
    value: parsePriceToNumber(rawPrice)
  };
}

async function getInventoryCaseCounts(steamId64, cratesMap) {
  const inventoryUrl = `https://steamcommunity.com/inventory/${steamId64}/730/2?l=english&count=5000`;
  const inventory = await fetchJson(proxied(inventoryUrl));

  if (!inventory?.success || !Array.isArray(inventory.assets) || !Array.isArray(inventory.descriptions)) {
    throw new Error('Could not read inventory. Make sure the inventory is public.');
  }

  const amountByClassInstance = new Map();
  for (const asset of inventory.assets) {
    const key = `${asset.classid}_${asset.instanceid}`;
    const amount = Number.parseInt(asset.amount || '1', 10);
    const currentAmount = amountByClassInstance.get(key) || 0;
    const safeAmount = Number.isFinite(amount) ? amount : 1;
    amountByClassInstance.set(key, currentAmount + safeAmount);
  }

  const cases = [];

  for (const description of inventory.descriptions) {
    const lookup = description.market_hash_name?.toLowerCase() || description.name?.toLowerCase();
    if (!lookup) {
      continue;
    }

    const crate = cratesMap.get(lookup);
    if (!crate) {
      continue;
    }

    const key = `${description.classid}_${description.instanceid}`;
    const quantity = amountByClassInstance.get(key) || 0;

    if (quantity > 0) {
      cases.push({
        name: crate.market_hash_name || crate.name,
        image: crate.image,
        quantity
      });
    }
  }

  if (!cases.length) {
    throw new Error('No cases were found in this inventory.');
  }

  return cases.sort((a, b) => {
    const quantityDifference = b.quantity - a.quantity;
    return quantityDifference !== 0 ? quantityDifference : a.name.localeCompare(b.name);
  });
}

function renderResults(items, totalCases, totalValue) {
  RESULTS.innerHTML = '';
  const cardRoot = CARD_TEMPLATE.content.querySelector('article');
  if (!cardRoot) {
    throw new Error('Case card template is missing.');
  }

  for (const item of items) {
    const card = cardRoot.cloneNode(true);
    const img = card.querySelector('img');
    const title = card.querySelector('h2');
    const qty = card.querySelector('.qty');
    const price = card.querySelector('.price');
    const subtotal = card.querySelector('.subtotal');

    img.src = item.image;
    img.alt = item.name;
    title.textContent = item.name;
    qty.textContent = `Quantity: ${item.quantity}`;
    price.textContent = `Unit Price: ${item.priceLabel}`;
    subtotal.textContent = `Subtotal: ${currencyFormatter.format(item.subtotal)}`;

    RESULTS.appendChild(card);
  }

  TOTAL_CASES.textContent = String(totalCases);
  TOTAL_VALUE.textContent = currencyFormatter.format(totalValue);
  SUMMARY.classList.remove('hidden');
}

async function calculate() {
  CALCULATE_BUTTON.disabled = true;
  SUMMARY.classList.add('hidden');
  RESULTS.innerHTML = '';

  try {
    setStatus('Resolving Steam profile...');
    const profileData = parseSteamProfileInput(PROFILE_INPUT.value);
    const steamId64 = await resolveSteamId64(profileData);

    setStatus('Loading case definitions...');
    const cratesMap = await loadCratesMap();

    setStatus('Reading inventory and matching cases...');
    const cases = await getInventoryCaseCounts(steamId64, cratesMap);

    setStatus('Fetching market prices...');
    const pricedCases = await Promise.all(
      cases.map(async (item) => {
        const price = await fetchCasePrice(item.name);
        return {
          ...item,
          priceLabel: price.label,
          subtotal: price.value * item.quantity
        };
      })
    );

    const totalCases = pricedCases.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = pricedCases.reduce((sum, item) => sum + item.subtotal, 0);

    renderResults(pricedCases, totalCases, totalValue);
    setStatus(`Done. Found ${pricedCases.length} case types.`);
  } catch (error) {
    setStatus(error.message || 'Something went wrong while calculating.', true);
  } finally {
    CALCULATE_BUTTON.disabled = false;
  }
}

CALCULATE_BUTTON.addEventListener('click', calculate);
PROFILE_INPUT.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    calculate();
  }
});
CURRENCY_SELECTOR.addEventListener('change', updateCurrencyFormatter);

populateCurrencies();
