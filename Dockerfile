FROM node:18-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto de los archivos
COPY . .

# Exponer el puerto
EXPOSE 8080

# Comando para iniciar el servidor
CMD ["node", "server.js"]
