# Stage 1: Build the frontend
FROM node:18 AS build-frontend

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the entire codebase and build the frontend
COPY . .
RUN npm run build

# Stage 2: Build and run the backend
FROM python:3.9-slim AS backend

WORKDIR /app

# Copy backend dependencies and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY ./api ./api

# Copy the built frontend files from the first stage to the backend image
COPY --from=build-frontend /app/.next /app/.next

# Run FastAPI using Uvicorn
CMD ["sh", "-c", "uvicorn api.index:app --host 0.0.0.0 --port ${PORT}"]


