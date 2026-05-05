'use client';

import { useState } from 'react';

// ─── Mock Data ──────────────────────────────────────────────────────────────────

interface FeedUser {
  name: string;
  initial: string;
  verified: boolean;
  winRate: number;
  copiers: number;
  gradientFrom: string;
  gradientTo: string;
}

interface FeedPost {
  id: string;
  user: FeedUser;
  content: string;
  symbol: string | null;
  side: 'BUY' | 'SELL' | null;
  pnl: string | null;
  time: string;
  likes: number;
  comments: number;
  shares: number;
}

const MOCK_POSTS: FeedPost[] = [
  {
    id: '1',
    user: {
      name: 'Alex Trading',
      initial: 'A',
      verified: true,
      winRate: 72,
      copiers: 234,
      gradientFrom: 'from-blue-500',
      gradientTo: 'to-cyan-400',
    },
    content:
      'Just closed a long EUR/USD position for +45 pips. The ECB policy divergence with the Fed continues to play out as expected. Looking for re-entry around 1.0820 support — that level has held three times this month and the 200 EMA on the 4H is converging there.',
    symbol: 'EURUSD',
    side: 'BUY',
    pnl: '+$450.00',
    time: '2h ago',
    likes: 28,
    comments: 5,
    shares: 3,
  },
  {
    id: '2',
    user: {
      name: 'Sarah Markets',
      initial: 'S',
      verified: true,
      winRate: 68,
      copiers: 189,
      gradientFrom: 'from-violet-500',
      gradientTo: 'to-purple-400',
    },
    content:
      'Gold looking very bullish above $2,050. The macro backdrop strongly supports further upside with rate cut expectations priced in for Q2. Holding my long from $2,020 with a trailing stop at $2,040. Target remains $2,100.',
    symbol: 'XAUUSD',
    side: 'BUY',
    pnl: '+$1,200.00',
    time: '4h ago',
    likes: 45,
    comments: 12,
    shares: 8,
  },
  {
    id: '3',
    user: {
      name: 'CryptoWhale',
      initial: 'C',
      verified: false,
      winRate: 55,
      copiers: 87,
      gradientFrom: 'from-orange-500',
      gradientTo: 'to-amber-400',
    },
    content:
      'BTC rejected at the $68K resistance again — third time this week. We need to see a clear daily close above $68.5K with volume before committing to longs. Staying flat and watching from the sideline. Patience pays.',
    symbol: 'BTCUSD',
    side: null,
    pnl: null,
    time: '5h ago',
    likes: 19,
    comments: 8,
    shares: 2,
  },
  {
    id: '4',
    user: {
      name: 'FX Master',
      initial: 'F',
      verified: true,
      winRate: 76,
      copiers: 512,
      gradientFrom: 'from-emerald-500',
      gradientTo: 'to-teal-400',
    },
    content:
      'Weekly analysis: USD/JPY approaching the critical 150 level. BOJ intervention risk is very real at these levels — we saw it happen in October. I\'m scaling into shorts here with tight stops above 150.80. Risk/reward is excellent.',
    symbol: 'USDJPY',
    side: 'SELL',
    pnl: null,
    time: '6h ago',
    likes: 67,
    comments: 23,
    shares: 15,
  },
  {
    id: '5',
    user: {
      name: 'Index Trader Pro',
      initial: 'I',
      verified: true,
      winRate: 64,
      copiers: 156,
      gradientFrom: 'from-rose-500',
      gradientTo: 'to-pink-400',
    },
    content:
      'S&P 500 hitting fresh all-time highs and the breadth is finally improving — advance/decline line confirming the move. Staying long with stops below 5,100. Next resistance is psychological at 5,300.',
    symbol: 'US500',
    side: 'BUY',
    pnl: '+$2,800.00',
    time: '8h ago',
    likes: 34,
    comments: 9,
    shares: 6,
  },
];

// ─── Icons ──────────────────────────────────────────────────────────────────────

function VerifiedBadge() {
  return (
    <svg
      className="w-4 h-4 text-primary flex-shrink-0"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="w-[18px] h-[18px]"
      fill={filled ? 'currentColor' : 'none'}
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      className="w-[18px] h-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      className="w-[18px] h-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 13l4-4 4 4 4-8 4 4"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 20h18"
      />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 10V5a2 2 0 012-2z"
      />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      className="w-[18px] h-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 5v.01M12 12v.01M12 19v.01"
      />
    </svg>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function UserAvatar({ user }: { user: FeedUser }) {
  return (
    <div
      className={`w-10 h-10 rounded-full bg-gradient-to-br ${user.gradientFrom} ${user.gradientTo} flex items-center justify-center shadow-md flex-shrink-0`}
    >
      <span className="text-sm font-bold text-white leading-none no-select">
        {user.initial}
      </span>
    </div>
  );
}

function TradePill({ symbol, side, pnl }: { symbol: string; side: 'BUY' | 'SELL' | null; pnl: string | null }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-secondary/80 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        {symbol}
      </span>
      {side && (
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-md tracking-wide ${
            side === 'BUY'
              ? 'bg-buy/10 text-buy'
              : 'bg-sell/10 text-sell'
          }`}
        >
          {side === 'BUY' ? 'LONG' : 'SHORT'}
        </span>
      )}
      {pnl && (
        <span className="text-xs font-mono font-bold text-buy price-value">
          {pnl}
        </span>
      )}
    </div>
  );
}

function EngagementBar({
  post,
  liked,
  onToggleLike,
}: {
  post: FeedPost;
  liked: boolean;
  onToggleLike: () => void;
}) {
  const likeCount = post.likes + (liked ? 1 : 0);

  return (
    <div className="flex items-center justify-between pt-3 border-t border-border/40">
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleLike}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
            liked
              ? 'text-sell bg-sell/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <HeartIcon filled={liked} />
          {likeCount}
        </button>

        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 px-2.5 py-1.5 rounded-lg transition-all duration-200">
          <CommentIcon />
          {post.comments}
        </button>

        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 px-2.5 py-1.5 rounded-lg transition-all duration-200">
          <ShareIcon />
          {post.shares}
        </button>
      </div>

      <button className="text-muted-foreground hover:text-foreground hover:bg-secondary/60 p-1.5 rounded-lg transition-all duration-200">
        <BookmarkIcon />
      </button>
    </div>
  );
}

// ─── Post Composer ──────────────────────────────────────────────────────────────

function PostComposer({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl card-modern p-5">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md flex-shrink-0">
          <span className="text-sm font-bold text-white leading-none no-select">
            Y
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Share a trade idea..."
            rows={3}
            className="w-full bg-secondary/30 border border-border/60 rounded-xl text-sm px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none transition-all duration-200"
          />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <button className="btn-soft inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200">
                <ChartIcon />
                Attach Chart
              </button>
              <button className="btn-soft inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200">
                <TagIcon />
                Tag Symbol
              </button>
            </div>
            <button
              disabled={!value.trim()}
              className="gradient-primary text-xs font-semibold px-5 py-2 rounded-xl text-white shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Publish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Feed Post Card ─────────────────────────────────────────────────────────────

function FeedPostCard({
  post,
  liked,
  onToggleLike,
}: {
  post: FeedPost;
  liked: boolean;
  onToggleLike: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl card-modern p-5 space-y-3.5 hover:border-border/80 transition-colors duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar user={post.user} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground truncate">
                {post.user.name}
              </span>
              {post.user.verified && <VerifiedBadge />}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
              <span className="font-medium text-primary/80">
                {post.user.winRate}% win
              </span>
              <span className="text-border">|</span>
              <span>{post.user.copiers.toLocaleString()} copiers</span>
              <span className="text-border">|</span>
              <span>{post.time}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-200">
            + Copy
          </button>
          <button className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/60 transition-all duration-200">
            <MoreIcon />
          </button>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm leading-relaxed text-foreground/90">
        {post.content}
      </p>

      {/* Trade pill */}
      {post.symbol && (
        <TradePill symbol={post.symbol} side={post.side} pnl={post.pnl} />
      )}

      {/* Engagement */}
      <EngagementBar post={post} liked={liked} onToggleLike={onToggleLike} />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function ClientFeed() {
  const [newPost, setNewPost] = useState('');
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  const toggleLike = (id: string) => {
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          Social Feed
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Discover trade ideas and market insights from top traders
        </p>
      </div>

      {/* Composer */}
      <PostComposer value={newPost} onChange={setNewPost} />

      {/* Feed */}
      <div className="space-y-4">
        {MOCK_POSTS.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            liked={likedPosts.has(post.id)}
            onToggleLike={() => toggleLike(post.id)}
          />
        ))}
      </div>
    </div>
  );
}
