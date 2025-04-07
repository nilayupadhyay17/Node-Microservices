const amqp = require("amqplib");
const logger = require("./logger");

let connection = null;
let channel = null;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;
const EXCHANGE_NAME = "facebook_events";
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function connectToRabbitMQ(retries = MAX_RETRIES) {
  while (retries > 0) {
    try {
      connection = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: false });
      logger.info("✅ Connected to RabbitMQ");
      return channel;
    } catch (e) {
      logger.error(`❌ Error connecting to RabbitMQ. Retries left: ${retries - 1}`, e);
      retries--;
      if (retries === 0) {
        logger.error("🚫 All retries failed. RabbitMQ connection could not be established.");
        throw e;
      }
      await delay(RETRY_DELAY_MS);
    }
  }
}

async function publishEvent(routingKey, message) {
  if (!channel) {
    await connectToRabbitMQ();
  }

  channel.publish(
    EXCHANGE_NAME,
    routingKey,
    Buffer.from(JSON.stringify(message))
  );
  logger.info(`Event published: ${routingKey}`);
}

async function consumeEvent(routingKey, callback) {
  if (!channel) {
    await connectToRabbitMQ();
  }

  const q = await channel.assertQueue("", { exclusive: true });
  await channel.bindQueue(q.queue, EXCHANGE_NAME, routingKey);
  channel.consume(q.queue, (msg) => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString());
      callback(content);
      channel.ack(msg);
    }
  });

  logger.info(`Subscribed to event: ${routingKey}`);
}

module.exports = { connectToRabbitMQ, publishEvent, consumeEvent };
