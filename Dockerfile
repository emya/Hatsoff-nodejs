FROM node:9

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
COPY message.js ./

RUN npm install
# If we want to build our code for production
# RUN npm install --only=production

# Bundle app source
COPY . .

EXPOSE 8889
CMD [ "node", "message.js" ]
