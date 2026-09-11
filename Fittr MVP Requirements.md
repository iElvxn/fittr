# Fittr MVP — Product Requirements

## 1. Product Overview

**Fittr** is a digital wardrobe and outfit-planning app that helps users organize the clothes they own, create outfits from those items, plan what to wear, and optionally share outfits with other users.

The MVP should answer one fundamental question:

> **Can Fittr make it meaningfully easier for someone to decide what to wear using the clothes they already own?**

The social layer exists to add inspiration, sharing, and retention, but it should not overshadow the core wardrobe experience.

### Core Product Loop

**Add clothes → Organize wardrobe → Create a Fit → Save/Wear → Plan → Share/Discover**

---

# 2. User Problems

Fittr addresses several related problems.

### Problem 1 — People forget what they own

Users may own dozens or hundreds of clothing items but only regularly think about a small subset of them.

Their wardrobe is physically available, but there is no convenient way to browse it digitally.

### Problem 2 — Choosing outfits is repetitive

Getting dressed often involves repeatedly asking:

- What should I wear today?
- What goes with these pants?
- Have I worn this before?
- What shoes work with this outfit?

Users have to mentally search through their wardrobe every time.

### Problem 3 — Fashion inspiration is disconnected from the user's wardrobe

Platforms such as Instagram and Pinterest provide enormous amounts of outfit inspiration, but the user generally has to translate that inspiration into their own wardrobe manually.

There is a gap between:

**"I like this outfit."**

and

**"Can I make something like this with what I own?"**

### Problem 4 — Existing wardrobe organization can feel like inventory management

A digital closet is only useful if maintaining it provides enough value to justify the effort of adding clothing items.

Fittr therefore needs to make the wardrobe itself useful rather than becoming a simple clothing database.

### Problem 5 — Users have no lightweight place to share outfits

Users who enjoy putting together outfits may want to show what they wore, receive feedback, and discover other people's outfits without needing a general-purpose social network.

---

# 3. Target Users

The initial target user is a consumer who:

- owns enough clothing to benefit from digital organization;
- cares at least somewhat about personal style;
- regularly thinks about what to wear;
- uses their phone for fashion inspiration;
- may enjoy sharing outfits but does not necessarily want a dedicated fashion influencer platform.

The MVP should **not** attempt to serve every type of fashion consumer.

The initial product should optimize for users who already have some motivation to organize and experiment with their wardrobe.

---

# 4. User Jobs To Be Done

### Primary Job

> When deciding what to wear, I want to see and combine the clothes I own so I can put together an outfit quickly.

### Secondary Jobs

> When I create an outfit I like, I want to save it so I can wear it again later.

> When I find an outfit I like, I want to save it as inspiration.

> When I know what I want to wear during the week, I want to plan my outfits ahead of time.

> When I create an outfit I'm proud of, I want to share it with other people.

> When I see other people's outfits, I want to discover ideas for my own style.

---

# 5. Product Goals

## Goal 1 — Make the user's wardrobe useful digitally

Users should be able to quickly build a digital representation of the clothes they actually own.

## Goal 2 — Make outfit creation easy

Creating an outfit should require selecting existing wardrobe items rather than manually rebuilding the outfit every time.

## Goal 3 — Create repeat value

The app should give users reasons to return after their wardrobe has been cataloged.

Examples:

- creating new Fits;
- wearing saved Fits;
- planning upcoming outfits;
- browsing inspiration;
- sharing outfits.

## Goal 4 — Establish a foundation for future personalization

The MVP should collect useful product signals without making AI the primary feature.

Potential future signals include:

- clothing preferences;
- frequently worn items;
- saved Fits;
- liked Fits;
- outfit combinations;
- style preferences.

## Goal 5 — Validate whether the core product is worth using

The MVP is primarily a **product-market validation vehicle**, not a feature-complete fashion platform.

The most important question is whether users continue using Fittr after the initial novelty of creating their wardrobe.

---

# 6. Non-Goals

The following are explicitly **outside the MVP**.

### Full Social Network

Fittr will not attempt to compete directly with Instagram, TikTok, or other general social platforms.

Therefore, the MVP will not include:

- Stories;
- Reels;
- live streaming;
- direct messaging;
- complex creator tools;
- elaborate follower mechanics;
- extensive social profiles.

### AI Stylist

The MVP will not provide a sophisticated conversational AI stylist.

No:

- "What should I wear today?" chatbot;
- personalized AI stylist;
- automatic outfit generation;
- advanced style analysis.

AI should initially automate tedious tasks rather than become the core experience.

### Fashion Marketplace

Fittr will not initially sell clothing.

No:

- marketplace;
- resale system;
- peer-to-peer transactions;
- checkout;
- seller accounts.

### Commerce

Affiliate shopping and product recommendations are future monetization opportunities, not MVP requirements.

### Weather-Based Recommendations

Weather-aware outfit recommendations are explicitly deferred.

### Exact Product Identification

The MVP does not need to identify the exact commercial product represented by a clothing image.

### Advanced Personalization

Recommendation algorithms, personalized feeds, and sophisticated ranking systems are not required for launch.

---

# 7. MVP Feature Scope

## 7.1 Authentication & Account

Users must be able to:

- create an account;
- sign in;
- sign out;
- maintain a basic profile.

### Required

- Authentication
- Basic user profile
- Username/display name
- Profile image optional

---

# 8. Digital Wardrobe

The wardrobe is the foundation of the product.

Users must be able to:

1. Add a clothing item.
2. Upload or capture an image.
3. Remove the image background.
4. Categorize the item.
5. View the item in their wardrobe.
6. Edit the item's information.
7. Delete the item.

### Initial Categories

- Tops
- Bottoms
- Shoes
- Outerwear
- Accessories

Additional subcategories can be introduced later.

### Clothing Metadata

The MVP may store:

- image;
- category;
- color;
- name;
- brand;
- optional notes.

Not all metadata needs to be manually entered.

AI should assist with:

- background removal;
- basic category detection;
- basic color detection.

The user must remain able to correct AI-generated metadata.

### Requirement

Adding clothing must feel substantially easier than manually maintaining a spreadsheet or inventory database.

---

# 9. Clothing Detail

Users should be able to open an individual wardrobe item and see:

- the clothing image;
- category;
- color;
- optional brand/name;
- Fits containing that item.

The screen should provide a clear action:

**Create Fit With This**

This creates a direct bridge between wardrobe management and outfit creation.

---

# 10. Outfit / Fit Creation

A **Fit** represents an outfit composed of items from the user's wardrobe.

Users must be able to:

1. Start a new Fit.
2. Select wardrobe items.
3. Combine multiple clothing categories.
4. Preview the combination.
5. Save the Fit.
6. Name the Fit.
7. Edit the Fit.
8. Delete the Fit.

### Example

A Fit might contain:

- black T-shirt;
- blue jeans;
- white sneakers;
- denim jacket.

The user should not need to re-add these items individually each time.

### Core Requirement

Every saved Fit must reference the underlying wardrobe items.

This enables future functionality such as:

- tracking wear frequency;
- finding Fits containing an item;
- generating recommendations;
- identifying missing pieces;
- shopping for similar items.

---

# 11. My Fits

Users should have a dedicated place to view saved outfits.

Minimum functionality:

- view all Fits;
- open a Fit;
- edit;
- delete;
- favorite;
- mark as worn.

Optional filtering:

- All
- Favorites
- Worn

The MVP should keep this simple.

---

# 12. Outfit Planning

Users should be able to assign saved Fits to specific days.

### Example

Monday → Fit A  
Tuesday → Fit B  
Wednesday → Fit C

The MVP does **not** need to automatically generate a weekly wardrobe.

The user chooses the Fits.

### Required

- weekly calendar;
- assign Fit to day;
- view planned Fit;
- replace planned Fit;
- remove planned Fit.

The planner exists to create another reason to return to the app and use saved Fits.

---

# 13. Social Sharing

The MVP includes a lightweight fashion-specific social layer.

Users can create a post from a Fit.

A post may contain:

- Fit image;
- caption;
- associated wardrobe items;
- creator profile.

Users can:

- like;
- comment;
- save;
- follow the creator.

### Important Product Boundary

The social feed is **not** the primary product.

A user should be able to receive meaningful value from Fittr without posting anything publicly.

---

# 14. Feed

The MVP should provide a simple feed for discovering Fits.

Initial feed types may include:

- Following;
- Recent;
- Popular.

The initial ranking algorithm can be simple.

Do not spend significant engineering effort creating an advanced recommendation engine before there is enough usage data to justify one.

---

# 15. Discover

Users should be able to discover:

- Fits;
- users;
- fashion inspiration.

Discovery can initially rely on:

- recent posts;
- popular posts;
- followed users.

Advanced personalized recommendations are deferred.

---

# 16. Search

Basic search should support:

- usernames;
- Fits.

Search does not need to support sophisticated natural-language fashion queries in the MVP.

---

# 17. Notifications

Users should receive notifications for meaningful social interactions.

Initial notification types:

- someone liked your Fit;
- someone commented on your Fit;
- someone followed you;
- someone interacted with your content.

Notifications should not become a major product area.

---

# 18. Privacy

Wardrobe data should be **private by default**.

A user's clothing inventory should not automatically become public because they participate in the social feed.

Users explicitly choose what they share.

### Minimum privacy requirements

- wardrobe private by default;
- Fits can be shared publicly;
- users can delete their content;
- users can delete wardrobe items;
- users can delete their account.

---

# 19. AI Requirements

AI is a supporting technology in the MVP.

### MVP AI

**Required/High Priority**

- Background removal
- Clothing category detection
- Basic color detection

### Deferred AI

- outfit recommendations;
- personalized stylist;
- weather-based recommendations;
- style embeddings;
- visual similarity search;
- "Find this item";
- automatic outfit generation.

### Principle

> **Use AI to remove friction, not to create gimmicks.**

If AI can save the user time while adding clothing, it belongs in the MVP.

If AI simply makes the product sound more impressive, it can wait.

---

# 20. Core User Flows

## Flow A — First-Time User

**Sign Up → Create Profile → Add First Clothing Item → Add More Items → View Wardrobe → Create First Fit**

### Activation Goal

The user should reach their first meaningful Fit quickly.

The onboarding experience should therefore encourage users to add enough clothing to make outfit creation useful.

---

# 21. Flow B — Add Clothing

**Wardrobe → Add Item → Take/Upload Photo → Background Removal → AI Categorization → Confirm/Edit → Save**

The user should always be able to override incorrect AI results.

---

# 22. Flow C — Create Fit

**Wardrobe / My Fits → Create Fit → Select Items → Preview → Name → Save**

The saved Fit becomes reusable.

---

# 23. Flow D — Plan Outfit

**My Fits → Select Fit → Add to Calendar → Choose Day**

The user can later replace or remove the planned Fit.

---

# 24. Flow E — Share Fit

**My Fits → Select Fit → Post → Add Caption → Publish**

The Fit becomes available to the social feed.

---

# 25. Flow F — Discover Inspiration

**Feed → View Fit → Like / Comment / Save → View Creator → Create Own Fit**

The long-term goal is to connect social discovery back to the user's own wardrobe.

The user should not simply consume content.

The ideal loop is:

**Discover → Save Inspiration → Recreate → Wear → Share**

---

# 26. Scope Boundaries

## Must Have

- Authentication
- Basic profile
- Add clothing
- Clothing image management
- Background removal
- Clothing categorization
- Digital wardrobe
- Create Fit
- Save Fit
- View/edit/delete Fits
- Weekly planning
- Basic social posting
- Feed
- Likes
- Comments
- Follow
- Save
- Basic notifications
- Privacy controls

## Should Have

- Color detection
- Favorites
- Mark Fit as worn
- Basic search
- Discover page
- Fit-to-wardrobe relationships

## Could Have

- More clothing metadata
- Advanced feed sorting
- Basic outfit statistics
- More wardrobe categories
- Better profile customization

## Won't Have in MVP

- AI stylist
- Automatic outfit recommendations
- Weather integration
- Shopping
- Affiliate commerce
- Marketplace
- DMs
- Stories
- Reels
- Live content
- Exact product recognition
- Advanced personalization
- Sophisticated recommendation algorithms

---

# 27. MVP Success Metrics

The MVP should measure **behavior**, not vanity metrics.

## Primary North Star Metric

### Weekly Active Users Who Create or Use a Fit

This measures whether Fittr is actually being used for its core purpose.

A user who opens the app and scrolls through a feed is less valuable than someone who actively uses their wardrobe and Fits.

---

## Activation Metrics

Track:

- percentage of new users who add their first clothing item;
- percentage who add at least 5 items;
- percentage who create their first Fit;
- time from signup to first Fit.

A particularly important activation event is:

> **User adds enough wardrobe items to create their first Fit and actually creates one.**

---

## Engagement Metrics

Track:

- Fits created per active user;
- wardrobe items added per user;
- Fits marked as worn;
- Fits planned;
- posts created;
- Fits saved;
- social interactions per active user.

---

## Retention Metrics

Track:

- D1 retention;
- D7 retention;
- D30 retention;
- percentage of users returning after creating their first Fit;
- percentage of users who create multiple Fits across different days/weeks.

The key question is:

> **Does Fittr remain useful after the user finishes setting up their wardrobe?**

---

# 28. Launch Criteria

The MVP should not launch simply because every feature is technically implemented.

### Functional Criteria

Before launch:

- users can successfully create accounts;
- users can add and manage wardrobe items;
- images load reliably;
- background removal works at acceptable quality;
- users can correct AI categorization;
- users can create and save Fits;
- Fits correctly reference wardrobe items;
- users can plan Fits;
- users can publish Fits;
- feed loading works reliably;
- likes/comments/follows work;
- notifications work;
- users can delete their content;
- wardrobe data remains private unless explicitly shared.

### Quality Criteria

The app should:

- avoid crashes during normal usage;
- handle poor network conditions reasonably;
- provide useful loading/error states;
- avoid losing wardrobe or Fit data;
- perform adequately on typical consumer devices.

### Product Criteria

Before public launch, test users should be able to understand:

1. What Fittr is.
2. Why they should add their clothes.
3. How to create a Fit.
4. How Fits relate to their wardrobe.
5. Why they should come back.

If users understand the social feed but don't understand the wardrobe value, the product is mispositioned.

---

# 29. Recommended Launch Experiment

The MVP should initially be treated as an experiment around one hypothesis:

> **People will repeatedly use a digital version of their wardrobe to create, save, plan, and share outfits.**

A useful early cohort would be observed through the following funnel:

**Signup**
↓  
**Add 5+ items**
↓  
**Create first Fit**
↓  
**Create second Fit**
↓  
**Plan or wear a Fit**
↓  
**Return the following week**

The biggest drop-off points should determine what gets improved next.

---

# 30. Post-MVP Priorities

Features should be prioritized based on observed user behavior rather than assumptions.

If users love creating Fits but struggle to find combinations:

→ Build outfit recommendations.

If users save other people's Fits:

→ Build **"Can I recreate this?"** functionality.

If users frequently ask where clothing came from:

→ Build product identification and affiliate commerce.

If users stop returning after building their wardrobe:

→ Improve planning, recommendations, and personalized discovery.

If social engagement is weak but wardrobe usage is strong:

→ Keep social lightweight and invest more heavily in the wardrobe/outfit experience.

If social engagement is unusually strong:

→ Expand discovery and creator features.

---

# 31. MVP Product Principle

Fittr should **not** launch as:

> "Instagram for fashion + AI + digital closet + shopping."

It should launch as:

> **"Your digital wardrobe for creating, planning, and sharing Fits."**

The MVP's job is to prove that the wardrobe/outfit loop provides enough recurring value to support a larger fashion platform later.

### MVP in One Sentence

**Fittr lets users catalog the clothes they own, create outfits from those clothes, plan when they'll wear them, and optionally share those outfits with a fashion-focused community.**