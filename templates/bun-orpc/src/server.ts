import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";

import spaTemplate from "../index.html";
import { router } from "./router";

const handler = new RPCHandler(router, {
  plugins: [new CORSPlugin()],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const server = Bun.serve({
  routes: {
    "/rpc/*": async (req) => {
      const { matched, response } = await handler.handle(req, {
        prefix: "/rpc",
        context: {},
      });
      if (matched) {
        return response;
      }
      return new Response("Not found", { status: 404 });
    },
    "/**": spaTemplate,
  },
});

console.log(`Server running at ${server.url}`);
