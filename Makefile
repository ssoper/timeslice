TESTS = $(shell find test -name "*test.js")

test:
	@NODE_ENV=testing ./node_modules/.bin/mocha -u bdd $(TESTS)

.PHONY: test
