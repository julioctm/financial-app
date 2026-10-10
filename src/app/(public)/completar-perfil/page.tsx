import { ProfileForm } from '@/components/ProfileForm';
import { Card } from '@/components/ui/card';
import { getProfile } from '@/lib/profile';

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const profile = await getProfile();

  return (
    <Card className="space-y-4">
      <div>
        <h1>Como podemos te chamar?</h1>
        <p className="mt-1 text-muted">
          Seu nome aparece para as pessoas do seu workspace, por exemplo como
          titular de um cartão ou dono de um gasto.
        </p>
      </div>
      <ProfileForm
        firstName={profile.first_name ?? ''}
        lastName={profile.last_name ?? ''}
        next={searchParams.next ?? '/dashboard'}
      />
    </Card>
  );
}
