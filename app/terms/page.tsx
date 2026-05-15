import { genPageMetadata } from 'app/seo'

export const metadata = genPageMetadata({ title: 'Terms and Conditions' })

export default function TermsAndConditions() {
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <div className="space-y-2 pt-6 pb-8 md:space-y-5">
        <h1 className="text-3xl leading-9 font-extrabold tracking-tight text-gray-900 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14 dark:text-gray-100">
          Terms and Conditions
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
          These Terms and Conditions govern your use of Akash Samui's personal developer blog and
          portfolio. By accessing this website, you agree to comply with and be bound by these
          terms.
        </p>

        <h2>2. Intellectual Property</h2>
        <p>
          Unless otherwise stated, all content, articles, tutorials, and project materials published
          on this website are the intellectual property of Akash Samui. You may share and link to
          the content, but please provide appropriate credit.
        </p>

        <h2>3. Disclaimer</h2>
        <p>
          The information provided on this website is for educational and informational purposes
          only. While every effort is made to ensure accuracy, there are no guarantees regarding the
          completeness, reliability, or accuracy of the content.
        </p>

        <h2>4. Links to Other Websites</h2>
        <p>
          Our website may contain links to third-party websites or services that are not owned or
          controlled by us. We assume no responsibility for the content, privacy policies, or
          practices of any third-party websites.
        </p>

        <h2>5. Changes to Terms</h2>
        <p>
          We reserve the right to modify or replace these Terms and Conditions at any time. Your
          continued use of the website after any changes constitutes acceptance of those changes.
        </p>

        <h2>6. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at akashsamui369@gmail.com.
        </p>
      </div>
    </div>
  )
}
