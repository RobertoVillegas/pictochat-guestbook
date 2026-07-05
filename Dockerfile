FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1.3 AS runtime
WORKDIR /app
ENV DATABASE_PATH=/data/picto/picto.db
ENV MEDIA_ROOT=/data/picto/previews
ENV PORT=3000
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/public ./public
COPY --from=build /app/tsconfig.json ./
RUN chown -R bun:bun /app
USER bun
VOLUME /data/picto
EXPOSE 3000
ENTRYPOINT ["sh", "-c", "bun run db:migrate && bun run seed && bun run start"]
