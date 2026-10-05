# maki-oss development tasks.
#
#   make test          stub-backed suite (no Docker, no gateway, no network)
#   make lint          shellcheck + fish syntax checks
#   make install-fish  symlink the fish plugin into the user's config

SHELL := /bin/sh

.PHONY: test lint install-fish

test:
	tests/run-tests.sh

lint:
	shellcheck bin/maki-oss tests/run-tests.sh tests/stub/openshell tests/stub/docker
	fish -n fish/functions/maki-oss.fish
	fish -n fish/conf.d/maki-oss.fish
	fish -n fish/completions/maki-oss.fish

install-fish:
	bin/maki-oss fish install
