import ilha, { html, mount, raw } from "ilha";

import { client } from "./orpc";

const app = ilha
  .state("name", "Alice")
  .derived("greeting", async ({ state, signal }) => {
    return client.greet({ name: state.name() }, { signal });
  })
  .bind("#name", "name")
  .render(
    ({ derived }) => html`
      <input id="name" type="text" />
      ${raw(derived.greeting.value ?? "")}
    `,
  );

mount({ app });
