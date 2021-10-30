# What are the SRE activities for complex and large services?

I'm working as an SRE for the infrastructure platform at LINE.

The platform, named Verda, is maintained by various services such as IaaS, PaaS, KaaS, etc., and many teams, so there is a lot more to figure out than a typical SRE.

What does a typical SRE do? Unfortunately, this is my first career as an SRE, so I can only speak from my imagination, but I would guess that they do the following;

* Improve the reliability of a single or few services.
    * We are responsible for selecting the DataStore and others, but we are not responsible for improving the reliability of the DataStore itself.
* Manage reliability metrics such as SLI/SLO specific to a particular service.
* Build the tools and culture for DevOps and evangelize it to your own team.

In contrast, in an environment like Verda, the number of targets above becomes frighteningly large, and it becomes complicated to work well as an SRE... 

In other words, It is tough to realize the above ideas along with a unified means and implement them in all services.

There are not many ways to effectively work as an SRE in this situation.

In my opinion, it is a good idea to have a member in each team who is responsible for connecting with the SRE and communicating with the overarching SRE team.

Not just SRE work, but any work to improve something can be divided into 3 major steps.

Those are Observation, planning, and introduction.

The hurdles for SREs targeting cross-teams are observation and introduction. 

Although planning is also arduous, it is impossible to develop a means to comply with a unified policy if necessary and sufficient observations exist.

It should be efficient to divide the 3-steps between the best engineers who belong to each team and understand their individual circumstances and focus. The SRE team can abstract the issues and weaknesses reported by them and plan and implement a sufficient and simple solution.

At the very least, it should yield better results than having one SRE team running around gathering information or each development team doing their own SRE activities.

Based on this philosophy, Verda's SRE team aims to efficiently improve the reliability of Verda, which has become large and complex due to the aggregation of diverse services.

We need several talented engineers and project managers to achieve this, so if you are interested, please come and talk to us.

Job Description: https://linecorp.com/ja/career/position/1357 (Sorry, Japanese only...)

If any of your readers have the same problem as mine, please contact me to exchange ideas. Actually, I can't speak English, but I can communicate in English via chat. I am sure we will become good friends.

(Ah, the company will arrange an interpreter for conversations with people interested in our position to have a pleasant discussion. Please feel free to do so.)

Contact: [manji@linux.com](mailto:manji@linux.com)

