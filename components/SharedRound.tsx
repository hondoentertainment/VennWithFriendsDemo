import React from 'react';
import { SharedRound as SharedRoundData } from '../types';
import AvatarDisplay from './AvatarDisplay';
import VennDiagram from './VennDiagram';
import Logo from './Logo';

interface SharedRoundViewProps {
  round: SharedRoundData;
}

/**
 * Read-only view of a shared round. This is what a link recipient lands on, so
 * it leads with the result and ends with a way to play — it is the only screen
 * a first-time visitor may ever see.
 */
const SharedRoundView: React.FC<SharedRoundViewProps> = ({ round }) => {
  const ordered = [...round.submissions].sort((a, b) => b.score - a.score);

  // The stored media carries only the fields the page renders; VennDiagram
  // wants a full ImageItem, so the unused ones are filled in.
  const asItem = (media: SharedRoundData['imageA'], id: string) => ({
    ...media,
    id,
    description: '',
    tags: [],
  });

  return (
    <div className="min-h-screen p-6 sm:p-8 bg-brand-cream flex flex-col items-center overflow-y-auto">
      <Logo size="sm" className="mb-8" />
      <div className="w-full max-w-5xl space-y-10 pb-16">
        <VennDiagram
          imageA={asItem(round.imageA, 'shared-a')}
          imageB={asItem(round.imageB, 'shared-b')}
          intersectionImage={round.hasImage ? `/r/${round.id}/image.png` : null}
          label={round.label || undefined}
          showGlow
        />

        <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-2xl border-4 border-brand-primary max-w-2xl mx-auto space-y-6">
          <h3 className="text-2xl font-heading font-bold text-center">The Verdict</h3>
          {round.reasoning && (
            <p className="text-xl italic text-center text-brand-dark/80">"{round.reasoning}"</p>
          )}

          <div className="space-y-3">
            {ordered.map((sub, i) => (
              <div
                key={`${sub.name}-${i}`}
                className={`flex items-center gap-4 p-4 rounded-2xl ${
                  sub.isWinner ? 'bg-brand-primary/10 border-2 border-brand-primary' : 'bg-brand-cream'
                }`}
              >
                <AvatarDisplay avatar={sub.avatar} color={sub.color} size="sm" />
                <div className="flex-1 text-left">
                  <div className="font-bold text-sm">{sub.name} {sub.isWinner && '👑'}</div>
                  <div className="text-brand-dark/70 italic">"{sub.content}"</div>
                </div>
                <div className="font-heading font-bold text-2xl text-brand-primary">{sub.score}</div>
              </div>
            ))}
          </div>

          <a
            href="/"
            className="block w-full py-5 bg-brand-dark text-white rounded-2xl font-bold text-xl text-center"
          >
            Play Venn with Friends
          </a>
        </div>
      </div>
    </div>
  );
};

export default SharedRoundView;
