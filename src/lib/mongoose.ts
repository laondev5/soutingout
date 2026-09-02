import mongoose from "mongoose"

function getMongoUri() {
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured.")
  }
  return mongoUri
}

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var mongooseCache: MongooseCache | undefined
}

const cache = global.mongooseCache ?? { conn: null, promise: null }

global.mongooseCache = cache

export async function connectDB() {
  if (cache.conn) {
    return cache.conn
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(getMongoUri(), {
      dbName: process.env.MONGODB_DB ?? "lff_sorting_out",
    })
  }

  cache.conn = await cache.promise
  return cache.conn
}
