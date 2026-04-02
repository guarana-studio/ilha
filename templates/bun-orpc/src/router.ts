import { os } from "@orpc/server";
import ilha, { html, type } from "ilha";

const greet = ilha.input(type<{ name: string }>()).render(
  ({ input }) =>
    html`
      <p>Hello, ${input.name}</p>
    `,
);

export const router = {
  greet: os.input(type<{ name: string }>()).handler(async ({ input }) => greet(input)),
};
