import { redirect } from 'next/navigation';

/**
 * Legacy sell route. Selling now happens in a dialog on the portfolio page,
 * so old links land there.
 */
export default function LegacySellPage() {
  redirect('/portfolio');
}
