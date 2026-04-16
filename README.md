# Case Value Calculator

- Accepts a Steam profile URL (`/id/...` or `/profiles/...`)
- Resolves `steamid64`
- Reads CS2 inventory cases
- Matches case names with crate images from the ByMykel CSGO API (https://github.com/ByMykel/CSGO-API/)
- Fetches current market prices and calculates total case value

## Notes

- Inventory must be public.
- Steam/profile requests are made through a public proxy endpoint to allow browser access.
