import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { DelegateModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { FOLDERS, isCloudinaryConfigured, signUpload } from "@/lib/cloudinary"
import { can, type SessionUser } from "@/lib/permissions"

/**
 * Hands the browser a short-lived signature so the file goes straight to
 * Cloudinary instead of being proxied through this server. The API secret is
 * used to sign here and never leaves the server.
 *
 * The folder is chosen here, never taken from the request, so a caller cannot
 * write anywhere except the two folders this app owns.
 */
export async function POST(request: Request) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: "Image uploads are not configured." }, { status: 503 })
  }

  let body: { kind?: string; email?: string }
  try {
    body = (await request.json()) as { kind?: string; email?: string }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const kind = body.kind ?? ""

  if (kind !== "accommodation" && kind !== "receipt") {
    return NextResponse.json({ error: "Unknown upload kind." }, { status: 400 })
  }

  const session = await auth()
  const user = session?.user as SessionUser | undefined

  // Accommodation photos are part of the catalogue, so they are staff-only.
  if (kind === "accommodation") {
    if (!user || !can(user, "accommodations.manage")) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 })
    }

    return NextResponse.json(signUpload({ folder: FOLDERS.accommodations }))
  }

  // Receipts come from delegates, who have no login. Rather than leave the
  // endpoint open, the request must name an email that actually registered —
  // so an upload always belongs to a real registration.
  if (!user) {
    const email = (body.email ?? "").trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: "Enter your email first." }, { status: 400 })
    }

    await connectDB()
    const delegate = await DelegateModel.findOne({ email }).select("_id")

    if (!delegate) {
      return NextResponse.json({ error: "No registration found for that email." }, { status: 404 })
    }
  } else if (!can(user, "payments.view")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 })
  }

  return NextResponse.json(signUpload({ folder: FOLDERS.receipts }))
}
