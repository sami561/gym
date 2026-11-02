import { useCallback, useState } from 'react';
import { SiteHeader } from './sections/SiteHeader';
import { Hero } from './sections/Hero';
import { InfoStrip } from './sections/InfoStrip';
import { About } from './sections/About';
import { Spaces } from './sections/Spaces';
import { Plans } from './sections/Plans';
import { Schedule } from './sections/Schedule';
import { Coaches } from './sections/Coaches';
import { AppSection } from './sections/AppSection';
import { TrialSection } from './sections/TrialSection';
import { Location } from './sections/Location';
import { InstagramBand } from './sections/InstagramBand';
import { Footer } from './sections/Footer';

export function LandingPage() {
  const [plan, setPlan] = useState<string | null>(null);

  // Choosing a plan pre-fills the trial form and scrolls to it.
  const choosePlan = useCallback((planId: string | null) => {
    setPlan(planId);
    document.getElementById('essai')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="bg-shield text-white">
        <SiteHeader />
        <main>
          <Hero />
          <InfoStrip />
          <About />
          <Spaces />
          <Plans onChoose={choosePlan} />
          <Schedule />
          <Coaches />
          <AppSection />
          <TrialSection preselectedPlan={plan} />
          <Location />
          <InstagramBand />
        </main>
        <Footer />
    </div>
  );
}
