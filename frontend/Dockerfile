FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
# Jenkins passes the build tag so the website shows which pipeline run deployed it.
ARG APP_VERSION=dev
RUN printf '{"version":"%s"}\n' "$APP_VERSION" > /usr/share/nginx/html/version.json
EXPOSE 80
