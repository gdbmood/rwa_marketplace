import { redirect } from 'next/navigation';

/**
 * Legacy listing price update route. Updating a listing now happens in a
 * dialog on the portfolio page, so old links land there.
 */
export default function LegacyUpdateListingPage() {
  redirect('/portfolio');
}
