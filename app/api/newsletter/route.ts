import { NewsletterAPI } from 'pliny/newsletter'
import siteMetadata from '@/data/siteMetadata'
import { NextResponse } from 'next/server'

// Must stay dynamic: a force-static route is prerendered at build time and
// cannot execute the POST handler that submits a subscriber to the provider.
export const dynamic = 'force-dynamic'

const plinyHandler = NewsletterAPI({
  // @ts-ignore
  provider: siteMetadata.newsletter.provider,
})

export async function POST(req: Request) {
  const provider = siteMetadata.newsletter?.provider
  let apiKey: string | undefined

  switch (provider) {
    case 'buttondown':
      apiKey = process.env.BUTTONDOWN_API_KEY
      break
    case 'mailchimp':
      apiKey = process.env.MAILCHIMP_API_KEY
      break
    case 'convertkit':
      apiKey = process.env.CONVERTKIT_API_KEY
      break
    case 'klaviyo':
      apiKey = process.env.KLAVIYO_API_KEY
      break
    case 'emailoctopus':
      apiKey = process.env.EMAILOCTOPUS_API_KEY
      break
    case 'beehiiv':
      apiKey = process.env.BEEHIIV_API_KEY
      break
  }

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[newsletter] Provider "${provider}" API key is missing. Simulating successful subscription for local testing.`
      )
      return NextResponse.json(
        { message: 'Successfully subscribed to the newsletter (Development Mode)' },
        { status: 201 }
      )
    }

    return NextResponse.json(
      { error: `Newsletter API key is missing for provider: ${provider}` },
      { status: 500 }
    )
  }

  // @ts-ignore
  return plinyHandler(req, { params: {} })
}
