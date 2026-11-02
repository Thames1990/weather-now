# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create: `gh issue create --title "..." --body "..."`; use a heredoc for multi-line bodies.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open` with appropriate `--label` and `--state` filters.
- Comment: `gh issue comment <number> --body "..."`.
- Apply/remove labels: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- Close: comment with the explanation, then run `gh issue close <number>`.

Infer the repo from `git remote -v`; `gh` does this automatically inside this clone. Before the first issue creation in a session, verify the target with `gh repo view --json nameWithOwner`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Keep external PRs out of the issue-triage queue unless this policy is deliberately changed.
