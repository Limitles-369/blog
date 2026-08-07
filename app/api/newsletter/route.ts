import { NewsletterAPI } from 'pliny/newsletter'
import siteMetadata from '@/data/siteMetadata'

// Must stay dynamic: a force-static route is prerendered at build time and
// cannot execute the POST handler that submits a subscriber to the provider.
export const dynamic = 'force-dynamic'

const handler = NewsletterAPI({
  // @ts-ignore
  provider: siteMetadata.newsletter.provider,
})

export { handler as GET, handler as POST }
