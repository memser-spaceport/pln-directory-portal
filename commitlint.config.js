module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: ['commitlint-plugin-function-rules'],
  rules: {
    // Disable generic validation
    'scope-case': [0],
    'scope-empty': [0],

    // Custom scope validation
    'function-rules/scope-case': [
      2,
      'always',
      (commit) => {
        const hasScope = !!commit.scope;
        const optionalScopeTypes = ['build', 'ci', 'docs', 'revert', 'feat'];
        const isScopeOptional = optionalScopeTypes.includes(commit.type);

        return isScopeOptional && !hasScope
          ? [true]
          : [
              false,
              'scope must be PL-XXX where XXX is a valid JIRA ticket number',
            ];
      },
    ],
  },
};
