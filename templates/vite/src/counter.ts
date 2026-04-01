import ilha, { html, type } from "ilha";

export const counter = ilha
  .input(type<{ initial?: number }>())
  .state("count", ({ initial }) => initial ?? 0)
  .on("@click", ({ state }) => state.count(state.count() + 1))
  .render(
    ({ state }) => html`<button type="button" class="counter">Count is ${state.count()}</button>`,
  );
