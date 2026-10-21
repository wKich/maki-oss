# maki-oss development tasks.
#
#   make test          stub-backed suite (no Docker, no gateway, no network)
#   make lint          shellcheck + fish syntax checks
#   make lint-profiles lint every example provider profile with the real CLI
#   make install-fish  symlink the fish plugin into the user's config

SHELL := /bin/sh

.PHONY: test lint lint-profiles install-fish

test:
	tests/run-tests.sh

lint:
	shellcheck bin/maki-oss tests/run-tests.sh tests/stub/openshell tests/stub/docker tests/stub/bun tests/stub/opencode
	fish -n fish/functions/maki-oss.fish
	fish -n fish/conf.d/maki-oss.fish
	fish -n fish/completions/maki-oss.fish

# Lints the shipped provider profiles against the real openshell CLI. Skips
# with a clear message when the CLI is absent; not part of `make test`.
lint-profiles:
	@if command -v openshell >/dev/null 2>&1; then \
		status=0; \
		for profile in examples/providers/*.yaml; do \
			openshell profile lint -f "$$profile" || status=1; \
		done; \
		exit $$status; \
	else \
		echo 'openshell CLI not found; skipping profile lint'; \
	fi

install-fish:
	bin/maki-oss fish install
