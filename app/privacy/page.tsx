import { genPageMetadata } from '@/app/seo'

export const metadata = genPageMetadata({ title: 'Privacy Policy' })

export default function PrivacyPolicy() {
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <div className="space-y-2 pt-6 pb-8 md:space-y-5">
        <h1 className="text-3xl leading-9 font-extrabold tracking-tight text-gray-900 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14 dark:text-gray-100">
          Privacy Policy
        </h1>
        <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
          Last updated:{' '}
          {new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
      <div className="prose dark:prose-invert container max-w-none py-12">
        <h2>1. Introduction</h2>
        <p>
          Welcome to Akash Samui's personal developer blog and portfolio. This privacy policy
          explains how we collect, use, and protect your personal information when you visit our
          website.
        </p>

        <h2>2. Information We Collect</h2>
        <p>
          We do not collect any personal data unless you voluntarily provide it through comments or
          newsletter subscriptions. Analytics services may collect anonymized usage data (such as
          pages visited, time spent on the site, and browser type) to help improve the website.
        </p>

        <h2>3. How We Use Your Information</h2>
        <p>
          Any information collected is used solely to improve the user experience, respond to
          inquiries, or deliver newsletter content if subscribed.
        </p>

        <h2>4. Third-Party Services</h2>
        <p>
          Our website may use third-party services like analytics providers or commenting systems.
          These services have their own privacy policies governing their data collection practices.
        </p>

        <h2>5. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us at
          akashsamui369@gmail.com.
        </p>
      </div>
    </div>
  )
}
