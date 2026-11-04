---
name: visual-design-foundations
description: How a trained eye looks at a screen before it judges it. Hierarchy and composition, information encoding, type colour and materials, interaction, and design judgement, drawn from Gestalt, Tufte, Norman, Rams and the Apple HIG. Given to the design-roaster and open to any agent that reviews or builds a screen. Not the project's design principles or decisions, those live in docs/design/ and stay away from the roaster.
---

# Visual design foundations

This is how to look, not what to write. Apply it in silence. A review that names a Gestalt law or quotes Tufte has stopped looking at the screen. Everything here is a question to put to the screen before judging it.

## 1. Hierarchy and composition

- First look. Where does the eye land first, second, third. Does that order match what the person came to do. When the most important thing lands first, the composition works, whatever else is wrong.
- Figure and ground. The thing being judged stands out from everything that helps judge it. Controls, metadata, counts and chrome are ground. When the ground is louder than the figure, say so.
- Weight is a budget. Size, contrast, colour and fill are spent on the one or two things that matter. When three things are loud, none is heard.
- Grouping and alignment. Things that belong together sit together and line up. Proximity groups before lines or boxes do. A row that reads as one object beats a row of five objects.
- Density. How much the eye processes per decision. Crowded is a problem only when it slows the decision. Sparse is a problem when it pushes the decision one level down.
- Focal point. Every screen has one. Name it in a sentence. If you cannot, that is the finding.

## 2. Information and its encoding

- One property, one meaning. Length for quantity, position for order or time, colour for category or state, size and weight for importance. Never two meanings on one colour and never two colours for one meaning.
- The question is what an encoding communicates that the person needs, not what else could be shown. A row of flags that tells the route at a glance is a strong encoding even when a chart would hold more.
- More data is not more information. A table that repeats what a bar shows is noise. A number with no comparison is noise. A count that is the same on every row is an empty column.
- Rhythm. Repeated rows read as a list when they share one structure. A row that breaks the structure means something or should.
- Text encodes last. A label explains what the form failed to say. A legend means the encoding did not work on its own.

## 3. Type, colour and materials

- One type scale with few steps. Size says importance, weight says emphasis, not both for the same thing. Small type in a loud colour is a contradiction.
- Colour is semantic or absent. One accent for the primary action and the current selection, one reserved colour for warnings, status colours only for status. Decorative colour, such as a colour per country or per category, has to make something faster to read, and it rarely does. Count the colours. More than four meanings in colour on one screen is already too many.
- Surfaces and depth. A sheet, a card and a panel each mean one thing. Depth shows what is on top of what, not what is important.
- Consistency is not uniformity. Different things may look different. The same thing must look the same everywhere.
- The screen has a visual identity already. Describe it in one sentence before judging it, such as a calm dark base, one warm accent, rows led by flags. A change that breaks that identity needs a reason that beats it.

## 4. Interaction

- Progressive disclosure. The common path on the surface, detail one tap deeper. A panel that opens on demand is structure, not hidden content.
- Recognition over recall. Can the person see the options instead of remembering them. An icon with no name is recall. A count with no unit is recall.
- Affordance. What can be tapped looks tappable, what cannot does not. One primary action per screen, clearly a button, carrying its result.
- State has a mark. Selected, current, booked, stale and unknown each get one visible mark, in the same place every time.
- Load. Ask what the person must hold in their head to finish. Ten numbers to subtract is load. One difference is not.
- Modal, panel or inline follows how often it is used and whether the context behind it is still needed while it is open.

## 5. Judgement

- First decide whether the concept is right for the job. When it is, say so in plain words, keep the concept, and judge the execution. Propose a new concept only when the current one fails the job, and then say what the current one does well that the new one must keep.
- Name the strengths first and concretely, such as the route strip is the focal point, the price is the second anchor, the actions recede. A fix that removes a strength is not a fix.
- More information is not better design. More whitespace is not better design. A redesign is not an improvement until it is set beside the screen it replaces and wins on the job.
- Taste and usability are different findings. Taste is I would not have done this. Usability is the person cannot see or do what they came for. Only usability pulls a score under 7 on its own.
- This screen is already good is a legitimate verdict. An 8 with two fixes is a better review than a 5 with a new concept when the screen does its job.
- Compare like with like. Judge against the best consumer app doing this job, not against the most a screen could show.
- Ask what the screen feels like to the person. A tool that helps them do the one thing they came for, or a dashboard that reports on it. Elegance is the sense that nothing more is needed. A screen that shows more and feels heavier has lost ground even when every element on it can be defended.
- When two shots of the same screen are given, say which one does the job better and why before anything else, and count what the later one lost as well as what it gained.

Sources for the reader, never for citing in a review: Gestalt grouping, Tufte on data ink and chartjunk, Norman on affordances, feedback and recognition, Rams on less but better, Apple's Human Interface Guidelines on hierarchy, clarity and deference.
