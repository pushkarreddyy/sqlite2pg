# Contributing to sqlite2pg

Thank you for your interest in improving `sqlite2pg`!

## 🚀 Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/sqlite2pg.git
   cd sqlite2pg
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build TypeScript:**
   ```bash
   npm run build
   ```

4. **Run Tests:**
   ```bash
   npm test
   ```

## 🧪 Testing Guidelines

- Write tests in `tests/` using Node's built-in `node:test` runner.
- Ensure new SQLite type mappings and transformations include corresponding assertions.
- Verify with `npm test`.

## 📦 Pull Requests

1. Fork the repo and create your feature branch: `git checkout -b feature/my-new-feature`
2. Commit your changes: `git commit -am 'feat: add support for XYZ'`
3. Push to the branch: `git push origin feature/my-new-feature`
4. Submit a Pull Request.
