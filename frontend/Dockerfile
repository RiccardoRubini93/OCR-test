FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
RUN npm install

# Add environment variable to set the port to 3003 for common frontend frameworks
ENV PORT=3003

COPY . .

EXPOSE 3003

CMD ["npm", "start"] 