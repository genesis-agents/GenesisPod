# Commit Message Format

## Structure

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Types

| Type     | Description                              |
| -------- | ---------------------------------------- |
| feat     | New feature                              |
| fix      | Bug fix                                  |
| docs     | Documentation only                       |
| style    | Code style (formatting, semicolons, etc) |
| refactor | Code refactoring                         |
| test     | Adding tests                             |
| chore    | Build process, auxiliary tools           |

## Scope Examples

- auth, user, admin (modules)
- api, ui, db (layers)
- deps, config (infrastructure)

## Subject Rules

- Use imperative mood ("add" not "added")
- Don't capitalize first letter
- No period at end
- Max 50 characters

## Example

```
feat(auth): add OAuth2 login support

- Implement Google OAuth2 provider
- Add refresh token rotation
- Create login/callback routes

Closes #123
```
