# Build context: the repository root (see spec.yaml), so both server/ and
# dashboard/ are available. Build locally with:
#   docker build -f server/Dockerfile .

# ---- Dashboard (static web app served by the server at /dashboard)
FROM node:22-slim AS dashboard
WORKDIR /dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# ---- Server
FROM rust:latest AS chef
RUN cargo install cargo-chef
WORKDIR /app
RUN apt update && apt install lld clang -y

FROM chef AS planner
COPY server/ .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY server/ .
ENV SQLX_OFFLINE true
RUN cargo build --release --bin server --bin check_r2

FROM debian:trixie-slim AS runtime
WORKDIR /app
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/server server
COPY --from=builder /app/target/release/check_r2 check_r2
COPY server/config config
COPY --from=dashboard /dashboard/dist dashboard
ENV APP_ENVIRONMENT production
ENTRYPOINT ["./server"]
