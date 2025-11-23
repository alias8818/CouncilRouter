# Contributing to AI Council Proxy

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Docker & Docker Compose (optional, but recommended)

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/alias8818/CouncilRouter.git
cd CouncilRouter

# Install dependencies
npm install

# Start services with Docker
docker-compose up -d postgres redis

# Or start them manually if you prefer

# Copy environment file
cp .env.example .env
# Add your API keys to .env

# Initialize database
psql -U postgres -f database/schema.sql

# Run tests
npm test

# Build the project
npm run build
```

## 📋 Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

- Write clean, documented code
- Follow existing code style (ESLint will help)
- Add tests for new features
- Update documentation if needed

### 3. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Lint your code
npm run lint
npm run lint:fix  # Auto-fix issues
```

### 4. Commit Your Changes

We use conventional commits:

```bash
git commit -m "feat: add new synthesis strategy"
git commit -m "fix: resolve timeout race condition"
git commit -m "docs: update API documentation"
git commit -m "test: add integration tests for Devil's Advocate"
```

Types:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Maintenance tasks

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:
- Clear description of changes
- Link to related issues
- Screenshots/examples if applicable

## 🎯 Areas for Contribution

### High Priority

- **Provider Adapters** - Add support for new AI providers (Mistral, Cohere, local models)
- **Synthesis Strategies** - Domain-specific synthesis algorithms
- **Documentation** - Tutorials, examples, architecture guides
- **Testing** - More integration tests, edge case coverage

### Good First Issues

Look for issues labeled `good first issue` - these are perfect for newcomers!

### Ideas

- Web UI for council configuration
- Streaming synthesis updates
- Plugin system for custom strategies
- Integration examples (GitHub Actions, VS Code extension)
- Performance optimizations
- Multi-modal support (images, audio)

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Description** - What happened vs. what you expected
2. **Steps to Reproduce** - Minimal code to reproduce the issue
3. **Environment** - Node version, OS, Docker version
4. **Logs** - Relevant error messages or stack traces
5. **Configuration** - Preset used, council configuration (sanitized)

## 💡 Feature Requests

For feature requests, please provide:

1. **Use Case** - What problem does this solve?
2. **Proposed Solution** - How should it work?
3. **Alternatives** - Other approaches considered
4. **Examples** - Code examples or mockups if applicable

## 📝 Code Style

We use ESLint and TypeScript for code quality:

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

### TypeScript Guidelines

- Use explicit types (avoid `any` when possible)
- Add JSDoc comments for public APIs
- Prefer interfaces over types for objects
- Use `readonly` for immutable data

### Testing Guidelines

- Unit tests for individual functions
- Integration tests for workflows
- Property-based tests for complex logic (using fast-check)
- Aim for >80% coverage on new code

Example test structure:

```typescript
describe('SynthesisEngine', () => {
  describe('consensusExtraction', () => {
    it('should extract majority position', () => {
      // Arrange
      const exchanges = [/* ... */];

      // Act
      const result = engine.consensusExtraction(exchanges);

      // Assert
      expect(result.confidence).toBe('high');
      expect(result.agreementLevel).toBeGreaterThan(0.8);
    });
  });
});
```

## 🔒 Security

If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. Email details to [security contact]
3. Allow time for patch before disclosure

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🤝 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment:

- Be respectful and considerate
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Trolling or insulting remarks
- Personal attacks
- Publishing others' private information

## 💬 Questions?

- **Discussions**: [GitHub Discussions](https://github.com/alias8818/CouncilRouter/discussions)
- **Issues**: [GitHub Issues](https://github.com/alias8818/CouncilRouter/issues)

## 🎉 Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- Project documentation

Thank you for contributing to AI Council Proxy! 🚀
