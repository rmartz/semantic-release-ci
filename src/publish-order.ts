/**
 * The publish-order rule: an npm package must be published in `prepare`, before
 * semantic-release pushes the tag, never in `publish`, after it.
 *
 * semantic-release runs `prepare`, pushes the tag, then runs `publish`. When
 * `@semantic-release/npm` publishes (its default), a failed publish leaves a tag
 * with no package behind it, and every consumer Dependabot moves to that tag fails
 * to install (rmartz/merge-safety#76, four releases in a row). Publishing from an
 * `@semantic-release/exec` `prepareCmd` instead means a failed publish stops the
 * release before any tag exists. See docs/publish-order.md.
 */

type Entry = { name: unknown; config: Record<string, unknown> };

const NPM = '@semantic-release/npm';
const EXEC = '@semantic-release/exec';

const PUBLISHES = /\b(?:npm|pnpm|yarn)\s+publish\b/;

const runsPublish = (command: unknown) => typeof command === 'string' && PUBLISHES.test(command);

const REQUIRED_SHAPE =
  `Set ["${NPM}", { "npmPublish": false }] and publish from a later ` +
  `["${EXEC}", { "prepareCmd": "npm publish" }]`;

export function checkPublishOrder(entries: Entry[]): string[] {
  const failures: string[] = [];
  const npmIndex = entries.findIndex((entry) => entry.name === NPM);

  if (npmIndex !== -1 && entries[npmIndex]?.config.npmPublish !== false) {
    failures.push(
      `"${NPM}" publishes after the tag is pushed, so a failed publish leaves a tag ` +
        `with no package. ${REQUIRED_SHAPE}.`,
    );
  }

  entries.forEach((entry, index) => {
    if (entry.name !== EXEC) {
      return;
    }
    if (runsPublish(entry.config.publishCmd)) {
      failures.push(
        `"${EXEC}" publishes in "publishCmd", after the tag is pushed. ` +
          `Move the command to "prepareCmd".`,
      );
    }
    if (runsPublish(entry.config.prepareCmd) && index < npmIndex) {
      failures.push(
        `"${EXEC}" publishes before "${NPM}" has set the release version. ` +
          `List it after "${NPM}".`,
      );
    }
  });

  return failures;
}
