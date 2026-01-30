import { createYoga, createSchema } from "graphql-yoga";
import { defineHandler, fromNodeHandler, html } from "nitro/h3";
import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";

// console.log('registeredTypeDefs', registeredTypeDefs(), registeredResolvers())

const schema = createSchema({
  typeDefs: mergeTypeDefs(registeredTypeDefs()),
  resolvers: mergeResolvers(registeredResolvers()),
  // typeDefs: `
  //   type Query {
  //     hello: String
  //   }
  // `,
  // resolvers: {
  //   Query: {
  //     hello: () => "Hello World"
  //   }
  // }
});

const yoga = createYoga({
  schema: schema,
});

// export default defineHandler(async (event) => {
//   const response = await yoga.fetch(event.req.url,
//     {
//       method: event.req.method,
//       headers: event.req.headers,
//       body: event.req.body, // req.body should be a valid BodyInit like an AsyncIterable, a ReadableStream, a Node.js Readable, a string or a Buffer etc...
//       // cache: event.req.cache,
//       // credentials: event.req.credentials,
//       // redirect: event.req.redirect,
//       // referrer: event.req.referrer,
//       // referrerPolicy: event.req.referrerPolicy,
//       // mode: event.req.mode,
//       // keepalive: event.req.keepalive,
//       // integrity: event.req.integrity,
//       // referrerPolicy: event.req.referrerPolicy,
//     },
//     // Third parameter becomes your server context
//     event.context);

//   const headersObj = Object.fromEntries(response.headers.entries())

//   return html`${await response.text()}`

//   return {
//     statusCode: response.status,
//     ...(await response.json()),
//     headers: headersObj // We assume that your environments accepts a regular JS object for response headers
//   }
// });

export default fromNodeHandler(yoga);