import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DemoDialog from '../components/landing/DemoDialog';
import FeatureSection from '../components/landing/FeatureSection';
import FinalCTA from '../components/landing/FinalCTA';
import HeroSection from '../components/landing/HeroSection';
import RestaurantStory from '../components/landing/RestaurantStory';
import SiteFooter from '../components/landing/SiteFooter';
import SiteHeader from '../components/landing/SiteHeader';
import SolutionsStrip from '../components/landing/SolutionsStrip';

const INTERESTS = new Set(['general', 'starter', 'growth', 'multi-outlet']);

export default function Landing() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('demo');
  const open = requested !== null;
  const interest = INTERESTS.has(requested || '') ? (requested as string) : 'general';

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'RasoiSet | Restaurant Management, All Set';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const openDemo = (value = 'general') => {
    const next = new URLSearchParams(params);
    next.set('demo', value);
    setParams(next);
  };

  const closeDemo = () => {
    const next = new URLSearchParams(params);
    next.delete('demo');
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-slate-900">
      <SiteHeader onBookDemo={() => openDemo('general')} />
      <main id="main">
        <HeroSection onBookDemo={() => openDemo('general')} />
        <FeatureSection />
        <RestaurantStory />
        <SolutionsStrip onSelect={openDemo} />
        <FinalCTA onBookDemo={() => openDemo('general')} />
      </main>
      <SiteFooter onContact={() => openDemo('general')} />
      <DemoDialog open={open} interest={interest} onClose={closeDemo} />
    </div>
  );
}
