// App-wide gate for first-person crisis text. Two surfaces:
//
// 1. Input gate (`confirmIfCrisis(text)`) — runs before sending user text to
//    an LLM. Returns true to proceed, false to bail (when the user picks
//    "Open helpline").
//
// 2. Output scan (`flagOutput(text)`) — runs on assistant text returned from
//    the model. Non-blocking. Surfaces a small dismissible banner with
//    helpline numbers when the response touches on self-harm/crisis content.
//    Used by oracle, reflect, and polish handlers per AI-Act-style
//    "model output marker" expectations.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import CrisisInterstitial from './CrisisInterstitial';
import { detectCrisis, detectCrisisInOutput } from '../utils/crisisDetect';
import { useLanguage } from '../i18n/LanguageContext';

const Ctx = createContext({ confirmIfCrisis: async () => true, flagOutput: () => false });

export function useCrisisGate() {
  return useContext(Ctx);
}

export function CrisisGateProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [outputBanner, setOutputBanner] = useState(false);
  const resolverRef = useRef(null);

  const confirmIfCrisis = useCallback((text) => {
    if (!detectCrisis(text)) return Promise.resolve(true);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const flagOutput = useCallback((text) => {
    if (!text) return false;
    // Suppress the banner on model refusal-boilerplate and meta-reasoning.
    // Four flavours:
    //
    // 1. Helpline citation: the model's own safety response, already offering
    //    resources. Stacking our banner on top is redundant noise.
    // 2. Refusal phrasing around self-harm/methods: "I won't describe acts of
    //    self-harm", "I cannot provide methods for self-harm" — the model is
    //    REFUSING and invoking self-harm as the refusal reason. Boilerplate.
    // 3. Safety meta-reasoning that leaked past server-side stripping: the
    //    model talking ABOUT its safety policy ("let me verify whether the
    //    user is at suicide risk", "checking if this triggers self-harm
    //    guidelines"). The mention of "suicide" / "self-harm" is in the
    //    context of policy-checking, not user-state. Banner here is the
    //    paranoia-on-paranoia case the user complained about: "the self
    //    harm stuff cant be coming up for sexual stuff like that."
    // 4. Self-referential safety-rail lectures ("I'm built with safety rails
    //    that hard-stop me from..."). Same: model lecturing about itself.
    //
    // The banner is meant to catch the opposite case: the model volunteers
    // genuine self-harm discussion without any refusal framing and without
    // citing help resources.
    const lower = text.toLowerCase();
    const citedHelpline = /\b988\b|\b13\s*11\s*14\b|\b116\s*123\b|findahelpline|crisis (line|lifeline|hotline|text|helpline)|suicide[^.]{0,30}(lifeline|hotline|line|prevention|helpline)/i.test(lower);
    if (citedHelpline) return false;
    const refusalAboutHarm = /\b(i (will )?(won'?t|will not|cannot|can'?t|won'?t ever|will never|never)|i['’]?m not going to|i do not|i refuse to|(the )?line (remains|is) that i)[^.!?\n]{0,120}\b(describe|discuss|provide|give|share|explain|detail|list|walk (you )?through|talk about)[^.!?\n]{0,60}\b(self[\s-]?harm|suicide|methods?|means|how to (kill|hurt|harm))/i.test(lower);
    if (refusalAboutHarm) return false;
    const safetyMeta = /\b(let me|i need to|i have to|i('?m| am) going to|first[, ]+let me)\s+(verify|check|confirm|make sure|see (whether|if))\b[^.!?\n]{0,200}\b(suicide|self[\s-]?harm|crisis|at\s+risk|safety\s+(policy|rail|guardrail|protocol|guideline))/i.test(lower);
    if (safetyMeta) return false;
    const safetyRails = /\bi('?m| am|'?ve| have)\b[^.!?\n]{0,80}\b(built|trained|designed|equipped|programmed|configured)\b[^.!?\n]{0,120}\b(safety|content)[\s-]+(rail|guardrail|protocol|policy|policies|filter|restriction|guideline)s?\b/i.test(lower);
    if (safetyRails) return false;
    const hit = detectCrisisInOutput(text);
    if (hit) setOutputBanner(true);
    return hit;
  }, []);

  function handleContinue() {
    setOpen(false);
    resolverRef.current?.(true);
    resolverRef.current = null;
  }

  function handleHelpline() {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  }

  return (
    <Ctx.Provider value={{ confirmIfCrisis, flagOutput }}>
      {children}
      {open && (
        <CrisisInterstitial onContinue={handleContinue} onOpenHelpline={handleHelpline} />
      )}
      {outputBanner && (
        <CrisisOutputBanner onDismiss={() => setOutputBanner(false)} />
      )}
    </Ctx.Provider>
  );
}

function CrisisOutputBanner({ onDismiss }) {
  const { t } = useLanguage();
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: '14px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--white)',
        border: 'var(--border-style)',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '12px',
        color: 'var(--body)',
        fontFamily: 'var(--font)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
        zIndex: 2200,
        maxWidth: '520px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
      }}
    >
      <span style={{ flex: 1, lineHeight: 1.5 }}>
        {t('crisis.outputBanner')}{' '}
        <a href="tel:988" style={{ color: 'var(--strong)' }}>988</a>
        {' · '}
        <a href="tel:131114" style={{ color: 'var(--strong)' }}>13 11 14</a>
        {' · '}
        <a href="tel:116123" style={{ color: 'var(--strong)' }}>116 123</a>
        {' · '}
        <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--strong)' }}>findahelpline.com</a>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          padding: '4px 10px',
          fontSize: '11px',
          background: 'transparent',
          color: 'var(--muted)',
          border: 'var(--border-style)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontFamily: 'var(--font)',
        }}
      >
        {t('common.dismiss') || 'Dismiss'}
      </button>
    </div>
  );
}
