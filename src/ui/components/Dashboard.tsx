'use client'
import React, { useState } from 'react'
import { useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Zap, TrendingUp, Loader, ChevronDown } from 'lucide-react'
import { generatePersonasAction } from '@/actions/GeneratePersonasAction'
import { Persona } from '@/domain/entities/Persona'

export const Dashboard: React.FC = () => {
  const [customerProfile, setCustomerProfile] = useState('')
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('input')
  const [expandedBackstory, setExpandedBackstory] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleGeneratePersonas = () => {
    if (!customerProfile.trim()) return
    
    setError(null)
    startTransition(async () => {
      try {
        const result = await generatePersonasAction(customerProfile)
        setPersonas(result)
        setActiveTab('results')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">AI Persona Generator</h1>
          <p className="text-lg text-slate-600">Create realistic buyer personas based on your ideal customer profile</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="input">Create Personas</TabsTrigger>
            <TabsTrigger value="results" disabled={!personas}>View Personas</TabsTrigger>
          </TabsList>

          {/* Input Tab */}
          <TabsContent value="input">
            <Card>
              <CardHeader>
                <CardTitle>Describe Your Ideal Customer</CardTitle>
                <CardDescription>Tell us about your ideal customer profile, and we'll generate AI personas based on it</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Customer Profile Description</label>
                  <textarea
                    placeholder="E.g., 'Bootstrapped founders aged 25-40 in tech, bootstrapping their first SaaS product, cost-conscious but willing to pay for value. Spend $50-200/month on tools. Tech-savvy, read product blogs and Hacker News. Value transparency and no surprises.'"
                    value={customerProfile}
                    onChange={(e) => setCustomerProfile(e.target.value)}
                    disabled={isPending}
                    className="text-base w-full min-h-[120px] p-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Be specific: include age range, industry, income level, values, pain points, tech comfort level
                  </p>
                </div>

                {error && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-900">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                <Alert className="border-blue-200 bg-blue-50">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900">
                    We'll generate 3 diverse personas that fit your customer profile. Each will have a unique backstory, financial situation, and decision-making style.
                  </AlertDescription>
                </Alert>

                <Button 
                  onClick={handleGeneratePersonas} 
                  disabled={!customerProfile.trim() || isPending}
                  size="lg"
                  className="w-full"
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader className="h-4 w-4 animate-spin" />
                      Generating Personas...
                    </span>
                  ) : (
                    'Generate Personas'
                  )}
                </Button>

                {/* Featured Results Preview */}
                <div className="mt-12 space-y-6">
                  <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-slate-700" />
                    What You'll Get
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-lg">Tailored to Your Customer</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-600">3 personas generated specifically from your customer profile, not generic archetypes.</p>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-lg">Rich Backstories</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-600">Detailed personal narratives explaining each persona's background, financial situation, and decision-making style.</p>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-lg">Ready for Analysis</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-600">Use these personas to evaluate pricing, messaging, features, and more (coming soon).</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results">
            {personas && (
              <div className="space-y-6">
                {/* Summary Alert */}
                <Alert className="border-slate-300 bg-slate-50">
                  <AlertCircle className="h-4 w-4 text-slate-600" />
                  <AlertDescription className="text-slate-900">
                    <strong>Personas Generated.</strong> Here are your {personas.length} AI personas tailored to your customer profile, complete with detailed backstories and backgrounds.
                  </AlertDescription>
                </Alert>

                {/* Personas Grid */}
                <div className="space-y-6">
                  {personas.map((persona) => (
                    <Card key={persona.id} className="border-slate-200">
                      <CardHeader>
                        <div className="space-y-3">
                          <div>
                            <CardTitle className="text-2xl mb-2">{persona.name}</CardTitle>
                            <CardDescription className="text-base">{persona.occupation}</CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              Age: {persona.age}
                            </Badge>
                            <Badge variant="outline">
                              {persona.educationLevel}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Expandable Backstory */}
                        {persona.backstory && (
                          <div className="border border-slate-300 rounded-lg">
                            <button
                              onClick={() =>
                                setExpandedBackstory(
                                  expandedBackstory === persona.id ? null : persona.id
                                )
                              }
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                            >
                              <h4 className="font-semibold text-slate-900">Backstory & Life Story</h4>
                              <ChevronDown
                                className={`h-5 w-5 text-slate-600 transition-transform ${
                                  expandedBackstory === persona.id ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            {expandedBackstory === persona.id && (
                              <div className="px-4 py-4 border-t border-slate-300 bg-slate-50">
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                  {persona.backstory}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Goals */}
                        {persona.goals.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-slate-900">Goals & Priorities</h4>
                            <ul className="space-y-2">
                              {persona.goals.map((goal, idx) => (
                                <li key={idx} className="flex gap-3 text-sm">
                                  <span className="text-blue-500 font-bold">•</span>
                                  <span className="text-slate-700">{goal}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Personality Traits */}
                        {persona.personalityTraits.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-slate-900">Personality Traits</h4>
                            <div className="flex flex-wrap gap-2">
                              {persona.personalityTraits.map((trait, idx) => (
                                <Badge key={idx} variant="secondary">
                                  {trait}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Interests */}
                        {persona.interests.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-slate-900">Interests & Hobbies</h4>
                            <div className="flex flex-wrap gap-2">
                              {persona.interests.map((interest, idx) => (
                                <Badge key={idx} variant="outline">
                                  {interest}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* CTA */}
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                  <CardHeader>
                    <CardTitle>What's Next?</CardTitle>
                    <CardDescription>Coming soon: Evaluate your pricing page, messaging, and features against these personas.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <Button 
                      onClick={() => {
                        setPersonas(null)
                        setActiveTab('input')
                        setCustomerProfile('')
                        setError(null)
                      }}
                      variant="default"
                    >
                      Generate Different Personas
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
