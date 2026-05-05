import fs from 'fs';

// Lee el archivo original de en desde git
const original = JSON.parse(fs.readFileSync('/tmp/en_original.json', 'utf8'));

// Merge manual de las nuevas claves EN
const newEnKeys = {
  "home": {
    "heroTagline": "Your team on the water, your data on the screen.",
    "heroDescription": "Record training from the mobile app and analyze it here with charts, GPS maps and real-time statistics.",
    "trainings": "trainings",
    "onTeam": "on the team",
    "races": "races",
    "myTeam": "My team",
    "registered": "registered",
    "kmTraveled": "Kilometers traveled",
    "sessionsByMonth": "Sessions by month",
    "avgSpm": "Average SPM",
    "totalStrokes": "Total strokes",
    "featureTrainingTitle": "Training",
    "featureTrainingDesc": "Check speed, SPM, DPS and strokes with charts and GPS map.",
    "featureCompetitionsTitle": "Competitions",
    "featureCompetitionsDesc": "Races recorded when you tap Done. Complete analysis and ranking.",
    "featureTeamTitle": "Team",
    "featureTeamDesc": "Manage roles, invite by email and edit club details.",
    "featureMapsTitle": "Maps and export",
    "featureMapsDesc": "Download the route as JPG with session summary.",
    "viewMore": "View more →",
    "birthdaySection": "Team birthdays",
    "loadingPlaceholder": "Loading...",
    "recentSessionsSection": "Latest sessions",
    "birthdaysEmpty": "No birth dates registered.",
    "sessionsEmpty": "No sessions recorded.",
    "competitionBadge": "Competition",
    "trainingBadge": "Training",
    "birthdayToday": "Today 🎂",
    "birthdayDays": "days",
    "monthNames": ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    "monthNamesLong": ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
  },
  "sessions": {
    "dayModalTitle": "Day summary",
    "dayStatSessions": "Sessions",
    "dayStatDistance": "Total distance",
    "dayStatAvgPaddlers": "Average paddlers",
    "dayMapTitle": "Routes",
    "daySessionsTitle": "Sessions for the day",
    "btnDownloadJpgShort": "Download JPG",
    "monthNames": ["January","February","March","April","May","June","July","August","September","October","November","December"],
    "noSessionsForPeriod": "No sessions for the selected period",
    "noGpsData": "No route data",
    "dist": "Dist:",
    "dur": "Dur:",
    "trackSection": "Segment {num} — direction at midpoint",
    "btnClose": "Close"
  },
  "community": {
    "messages": "Messages",
    "newConversation": "New conversation",
    "searchPlaceholder": "Search contact…",
    "selectConversation": "Select a conversation",
    "typeMessage": "Write a message…",
    "noResults": "No results",
    "replyingLabel": "↩ Replying:",
    "replyButton": "↩ Reply"
  },
  "forum": {
    "loading": "Loading forum...",
    "noPosts": "No posts in this category.",
    "author": "User",
    "pinned2": "Pinned",
    "new2": "NEW",
    "noComments": "No comments yet. Be the first!",
    "author2": "User",
    "newPostTitle": "New post",
    "labelTitle": "Title",
    "labelCategory": "Category",
    "optGeneral": "General",
    "optAnnouncements": "Announcements",
    "optTraining": "Training",
    "optCompetitions": "Competitions",
    "labelContent": "Content",
    "contentPlaceholder": "What do you want to share?",
    "btnCancelPost": "Cancel",
    "btnPublishPost": "Publish",
    "loadingPost": "Loading post...",
    "backToForum": "← Back to forum",
    "noCommentsYet": "No comments yet. Be the first!",
    "commentPlaceholder": "Write your comment...",
    "addComment": "Add comment",
    "btnComment": "Comment",
    "newPostBtn": "+ New post",
    "categoryLabel": "Categories",
    "statsLabel": "Statistics",
    "totalPostsLabel": "Total posts",
    "thisWeekLabel": "This week",
    "communityTitle": "Community forum",
    "communitySubtitle": "Connect with your team",
    "sortLabel": "Sort",
    "optSortRecent": "Most recent",
    "optSortComments": "Most commented",
    "optSortPinned": "Pinned first",
    "errorComment": "Write a comment before sending."
  }
};

// Merge en original con las nuevas keys
function merge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      merge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

merge(original, newEnKeys);

fs.writeFileSync('src/locales/en.json', JSON.stringify(original, null, 2) + '\n', 'utf8');
console.log('Merged en.json successfully');
