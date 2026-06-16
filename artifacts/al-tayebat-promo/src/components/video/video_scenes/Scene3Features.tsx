import { motion, AnimatePresence } from 'framer-motion';
import { PhoneMockup } from '../PhoneMockup';
import { OffersScreen } from '../screens/OffersScreen';
import categoriesImg from '@assets/app-screens/categories.jpg';
import productImg from '@assets/app-screens/product-filled.jpg';
import { useEffect, useState } from 'react';

export function Scene3Features() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),   // Show categories
      setTimeout(() => setPhase(2), 3000),  // Switch to offers
      setTimeout(() => setPhase(3), 5500),  // Switch to product
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg-light)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ scale: 1.1, opacity: 0, filter: 'blur(10px)', transition: { duration: 0.6 } }}>
      
      {/* Dynamic Background Pattern */}
      <motion.div 
        className="absolute inset-0 opacity-10"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, var(--color-primary) 1px, transparent 0)', backgroundSize: '24px 24px' }}
        animate={{ backgroundPosition: ['0px 0px', '24px 24px'] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />

      <div className="w-full max-w-md px-6 relative z-10 flex flex-col h-full py-12">
        
        <div className="flex-1 flex items-center justify-center relative">
          <motion.div
            animate={{ 
              scale: phase === 0 ? 0.9 : 1,
              y: phase === 0 ? 50 : 0
            }}
            transition={{ type: 'spring', damping: 20 }}>
            <PhoneMockup>
              <AnimatePresence mode="popLayout">
                {phase < 2 && (
                  <motion.img 
                    key="cat"
                    src={categoriesImg} alt="Categories" 
                    className="w-full h-full object-cover absolute inset-0"
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.5 }}
                  />
                )}
                {phase >= 2 && phase < 3 && (
                  <motion.div
                    key="off"
                    className="w-full h-full absolute inset-0"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.5 }}>
                    <OffersScreen />
                  </motion.div>
                )}
                {phase >= 3 && (
                  <motion.img 
                    key="prod"
                    src={productImg} alt="Product" 
                    className="w-full h-full object-cover absolute inset-0"
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                  />
                )}
              </AnimatePresence>
            </PhoneMockup>
          </motion.div>
          
          {/* Floating feature cards */}
          <AnimatePresence mode="wait">
            {phase >= 1 && phase < 2 && (
              <FeatureCard key="f1" title="تصفح جميع الأقسام" align="right" y="-20vh" />
            )}
            {phase >= 2 && phase < 3 && (
              <FeatureCard key="f2" title="عروض يومية وخصومات" align="left" y="0vh" />
            )}
            {phase >= 3 && (
              <FeatureCard key="f3" title="مجاني للمطاعم بدون عمولات أو تعقيدات" align="right" y="20vh" />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function FeatureCard({ title, align, y }: { title: string, align: 'left'|'right', y: string }) {
  return (
    <motion.div 
      className={`absolute ${align === 'right' ? 'right-4' : 'left-4'} bg-white rounded-xl shadow-xl px-5 py-3 border-2 border-primary/20 z-30`}
      style={{ y }}
      initial={{ opacity: 0, scale: 0.8, x: align === 'right' ? 50 : -50 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: align === 'right' ? 50 : -50 }}
      transition={{ type: 'spring', damping: 15 }}>
      <p className="text-primary font-bold text-lg m-0 text-center max-w-[44vw] leading-snug">{title}</p>
    </motion.div>
  );
}
