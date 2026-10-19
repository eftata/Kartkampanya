import { useState } from "react";
import { PageHead } from "../components/Layout";
import { SaveBar, useSave } from "../components/SaveBar";
import { SpendForm } from "../components/SpendForm";
import { saveUser } from "../lib/data";
import { useSession } from "../lib/store";

export function Spend() {
  const { user, profile } = useSession();
  const [spend, setSpend] = useState(profile.spend);
  const [formKey, setFormKey] = useState(0);
  const norm = (s: typeof spend) =>
    JSON.stringify(
      Object.entries(s)
        .filter(([, v]) => v)
        .sort(),
    );
  const dirty = norm(spend) !== norm(profile.spend);
  const save = useSave(() => saveUser(user.uid, { spend }));

  return (
    <>
      <PageHead kicker="Harcamam" title="Aylık harcama profilin">
        Plan bu tutarlara göre hesaplanır. Kaba tahmin yeterli.
      </PageHead>
      <SpendForm key={formKey} value={spend} onChange={setSpend} />
      <SaveBar
        dirty={dirty}
        {...save}
        onSave={save.run}
        onReset={() => {
          setSpend(profile.spend);
          setFormKey((k) => k + 1);
        }}
      />
    </>
  );
}
