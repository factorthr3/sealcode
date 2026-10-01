import { redirect } from 'next/navigation';

// There's no self-serve sign-up: accounts are set up by Sealcode after a conversation.
export default function SignupPage() {
  redirect('/contact?reason=pricing');
}
