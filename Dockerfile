# BDBV API + web app, one container. Build from the repository root:
#   docker build -t bdbv-api .
FROM node:20-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/
# Optional build-time CA (only for networks with a TLS-inspecting proxy):
#   docker build --secret id=build_ca,src=/path/ca.crt --build-arg HTTPS_PROXY=... .
# The final check makes the build fail if npm did not really install the dependencies.
RUN --mount=type=secret,id=build_ca,required=false \
    cd backend && \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi && \
    npm ci --omit=dev && npm cache clean --force && \
    node -e "['pg','express','jsonwebtoken','bcryptjs','@anthropic-ai/sdk'].forEach(function (m) { require(m); }); console.log('dependencies OK')"
COPY backend/src backend/src
COPY prototype prototype
COPY config config
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/api/v1/health >/dev/null || exit 1
CMD ["node", "backend/src/server.js"]
