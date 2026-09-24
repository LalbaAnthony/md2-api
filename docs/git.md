# Git usage

### Branching

We use a Git workflow based on two main branches:

| Branch    | Purpose                                                             |
| --------- | ------------------------------------------------------------------- |
| `main`    | Production-ready code. All hotfixes and critical patches land here. |
| `develop` | A development branch for ongoing work.                              |

For non-main branches, use prefixes to clarify the purpose:

| Prefix  | When to use                 | Example             |
| ------- | --------------------------- | ------------------- |
| `feat/` | New feature                 | `feat/user-auth`    |
| `fix/`  | Bug fix                     | `fix/login-error`   |
| `ref/`  | Code refactoring or cleanup | `ref/api-endpoints` |
| `docs/` | Documentation changes       | `docs/setup-guide`  |
| `test/` | Adding or updating tests    | `test/auth-module`  |

> **Note:** All contributions **must** go through **Pull Requests** (PRs). Direct pushes to `main` are **not** allowed.

### Commits

- Conventional Commits (https://www.conventionalcommits.org/)
  - `feat: add user authentication`
  - `fix: correct product price calculation`
  - `chore: update dependencies`

### Workflows

In any case, make sure you're up to date with the remote repo before starting any work using `git fetch`/`git pull`.

Working on a new feature or bugfix? Here's the standard workflow:

```sh
git fetch

# Create a new branch from develop
git checkout develop
git pull origin develop
git pull origin main # To keep develop up to date with main
git checkout -b feat/my-new-feature

# Make your changes, then stage and commit them, and push to the remote branch
git add . ; git commit -m "feat: add new feature"
git push

# Merge to develop via a pull request on GitHub, get it reviewed and approved, then merge it.
# git checkout develop
# git pull origin develop
# git pull origin feat/my-new-feature
# git push

# Merge to main via a pull request on GitHub, get it reviewed and approved, then merge it.
# git checkout main
# git pull origin main
# git push

# Delete the feature branch if it's no longer needed
git branch -d feat/my-new-feature

# Switch back to develop for the next work
git checkout develop

# Repeat
```

Update `main` using `develop`:

```sh
git fetch

# Keep main up to date with develop
git checkout develop
git pull --rebase
git pull origin main
git push

git checkout main
git pull --rebase
git pull origin develop
git push

# Switch back to develop for the next work
git checkout develop

# Repeat
```
