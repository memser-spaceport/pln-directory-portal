import { Accordion } from '@protocol-labs-network/ui';

const faqItems = [
  {
    triggerText: 'What is Protocol Labs?',
    content:
      "<p>Protocol Labs is an open-source R&D lab building protocols, tools, and services to radically improve the internet. <a href='https://protocol.ai/' target='_blank' rel='noopener noreferrer'><u>Learn more about Protocol Labs</u></a>.</p>",
  },
  {
    triggerText: 'How is Protocol Labs related to the Protocol Labs Network?',
    content:
      '<p>Protocol Labs and the teams in its network are united by a shared mission. By working together as a community, we are able to speed up the research - development - deployment pipeline and bring about computing breakthroughs more quickly.</p><p>We’ve successfully launched multiple web3 projects that deliver against this vision, and we have ambitious goals to continue to transform and improve computing and the decentralized web.</p>',
  },
  {
    triggerText: 'I want to join the network, what can I do?',
    content:
      "<p>We welcome teams interested in the Protocol Labs mission to collaborate with us on a short or long-term basis. You can read more about membership options <a href='https://protocol.almanac.io/handbook/protocol-labs-spaceport-JzKymu/pln-membership-G4pIdsLCQ6q0BJwwDTOfaVSeoV3NNd8V' target='_blank' rel='noopener noreferrer'><u>here</u></a>, or reach out to <a href='mailto:spaceport-admin@protocol.ai' title='mailto:spaceport-admin@protocol.ai'><u>spaceport-admin@protocol.ai</u></a> and we'll take things from there.</p>",
  },
  {
    triggerText: 'What is Spaceport?',
    content:
      '<p>Spaceport is your one-stop shop for Protocol Labs Network resources and member benefits. <br/>Starting and scaling a web3 project is hard, and it can be lonely working in a distributed and remote environment. We’d like to make this easier. The best way to do this, in our experience, is to help individuals and teams connect with and learn from each other. Spaceport was created to make these connections as low friction as possible–through office hours, events, a network directory, and more–so that <strong>together</strong> we can build the protocols and technology that advances humanity.</p>',
  },
];

export const Faq = () => {
  return (
    <section>
      <div className="mb-12 text-center">
        <h2 className="text-5xl font-bold leading-[60px]">
          Got questions?
          <br />
          <span className="text-blue-600">We have answers</span>
        </h2>
      </div>
      <Accordion items={faqItems} />
    </section>
  );
};
