import Link from 'next/link';

export const Substack = () => {
  return (
    <section className="bg-pln-gradient-01 shadow-drop-shadow rounded-lg p-8 text-white">
      <div className="sm:mx-auto sm:max-w-[713px]">
        <h3 className="text-2xl font-semibold">Subscribe to our Substack!</h3>
        <p className="mt-2 mb-4 text-lg text-slate-100">
          Stay up to date with developments, new programs, and progress from
          other teams in the network.
        </p>
        <Link href="https://plnnews.substack.com/subscribe?utm_source=menu&simple=true&next=https%3A%2F%2Fplnnews.substack.com%2F">
          <a
            className="focus:shadow-pln-shadow-01--focus shadow-pln-shadow-01 rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-900 hover:border-slate-400 focus:border-blue-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            Subscribe
          </a>
        </Link>
        <Link href="https://plnnews.substack.com/">
          <a
            className="ml-4 text-sm font-semibold"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn More
          </a>
        </Link>
      </div>
    </section>
  );
};
