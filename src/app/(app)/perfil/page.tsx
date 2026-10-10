import { ProfileForm } from '@/components/ProfileForm';
import { Card, PageHeader } from '@/components/ui/card';
import { requireProfile } from '@/lib/profile';

export default async function ProfilePage() {
  const profile = await requireProfile('/perfil');

  return (
    <>
      <PageHeader
        title="Perfil"
        description="O primeiro nome é o que aparece nas listas de pessoas."
      />
      <Card className="max-w-md">
        <ProfileForm
          firstName={profile.first_name ?? ''}
          lastName={profile.last_name ?? ''}
        />
      </Card>
    </>
  );
}
