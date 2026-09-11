# Contributing to sqlite2pg

Thank you for contributing to `sqlite2pg`.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/pushkarreddyy/sqlite2pg.git
   cd sqlite2pg
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build TypeScript:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Testing Guidelines

- Tests use Node's native `node:test` runner.
- All new features, type mappings, and bug fixes should include corresponding test cases in `tests/`.
- Verify full test suite passes with `npm test` before opening a pull request.

## Submitting Pull Requests

1. Fork the repository and create a branch from `main`.
2. Keep pull requests focused on a single change.
3. Include updated documentation where relevant.
4. Ensure all tests pass.
