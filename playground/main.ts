import ilha, { html, mount } from "ilha";
import z from "zod";

const counter = ilha
  .input(z.object({ count: z.number().default(0) }))
  .state("count", ({ count }) => count)
  .on("[data-increment]@click", ({ state }) => {
    state.count(state.count() + 1);
  })
  .effect(({ state }) => {
    console.log("change", state.count());
    return () => {
      console.log("cleanup", state.count());
    };
  })
  .render(({ state }) => {
    return html`
      <div>${state.count()}</div>
      <button data-increment>Increment</button>
    `;
  });

const app = ilha.slot("counter", counter).render(
  ({ slots }) => html`
    <div>
      ${slots.counter({ count: 5 })}
    </div>
  `,
);

mount({ app });
