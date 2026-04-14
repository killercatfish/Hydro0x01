# ===== BUILD STAGE =====
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for Vite env vars (pass these in docker-compose)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ===== SERVE STAGE =====
FROM nginx:alpine

# Copy the built React SPA to the Nginx html folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Add a custom nginx.conf to handle React Router (fallback to index.html)
RUN echo 'server {' > /etc/nginx/conf.d/default.conf && \
    echo '    listen       80;' >> /etc/nginx/conf.d/default.conf && \
    echo '    server_name  localhost;' >> /etc/nginx/conf.d/default.conf && \
    echo '    root   /usr/share/nginx/html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    index  index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    location / {' >> /etc/nginx/conf.d/default.conf && \
    echo '        try_files $uri $uri/ /index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    }' >> /etc/nginx/conf.d/default.conf && \
    echo '}' >> /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
